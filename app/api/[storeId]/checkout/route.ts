import Stripe from "stripe";
import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { getStripe } from "@/lib/stripe";
import { ApiError, handleApiError, parseBody } from "@/lib/api";
import {
  CHECKOUT_CURRENCY,
  formatMinorUnits,
  fromMinorUnits,
  minChargeMinorUnits,
  toMinorUnits,
} from "@/lib/money";
import { ConfigError, getCheckoutConfig, resolveStorefront, type CheckoutConfig } from "@/lib/config";
import { CHECKOUT_RATE_LIMIT, clientAddress, consume } from "@/lib/rate-limit";
import { checkoutSchema } from "@/lib/validations";

/**
 * Stripe rejects an `expires_at` less than 30 minutes after it creates the
 * session, measured on Stripe's clock. Ours is computed before the API call,
 * so clock skew plus latency could push a bare 30 minutes under the limit.
 */
export const STRIPE_MIN_SESSION_LIFETIME_SECONDS = 30 * 60;
/** Safety margin over Stripe's minimum for clock skew and request latency (total lifetime: 60 minutes). */
export const SESSION_EXPIRY_MARGIN_SECONDS = 30 * 60;
/**
 * How long a shopper has to pay before the Stripe session expires (Unix
 * seconds from now). Stripe's default is 24 hours; a short expiry shrinks the
 * window in which the same single-unit product can be bought twice (nothing is
 * reserved at checkout, see the webhook's oversell check).
 */
export const SESSION_EXPIRY_SECONDS = STRIPE_MIN_SESSION_LIFETIME_SECONDS + SESSION_EXPIRY_MARGIN_SECONDS;

/**
 * CORS headers for a browser caller. Only allow-listed storefront origins get
 * `Access-Control-Allow-Origin`; anything else gets no CORS grant and the
 * browser blocks the response. CORS is not authentication (non-browser clients
 * ignore it): the server-side origin check in POST is what refuses redirects
 * to unknown sites.
 */
function corsHeaders(allowedOrigin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (allowedOrigin) headers["Access-Control-Allow-Origin"] = allowedOrigin;
  return headers;
}

// Fails fast, before any order is written, if checkout is misconfigured. The
// client gets a generic message; variable names (never values) go to the logs.
function loadCheckoutConfig(): CheckoutConfig {
  try {
    return getCheckoutConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error("[CHECKOUT_CONFIG]", error.message);
      throw new ApiError(503, "Checkout is temporarily unavailable due to a server configuration error.");
    }
    throw error;
  }
}

/** Which origin (if any) the response may be shared with, given the request's Origin header. */
function grantedOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;
  try {
    const storefront = resolveStorefront(getCheckoutConfig(), requestOrigin);
    return storefront.ok ? storefront.origin : null;
  } catch {
    // Misconfigured server: no CORS grant; POST reports the 503.
    return null;
  }
}

export async function OPTIONS(request: Request) {
  const origin = grantedOrigin(request.headers.get("origin"));
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: Request, props: { params: Promise<{ storeId: string }> }) {
  const requestOrigin = request.headers.get("origin");
  let cors = corsHeaders(null);
  try {
    const { storeId } = await props.params;
    const config = loadCheckoutConfig();

    // Where Stripe sends the shopper afterwards. Taken from the request's
    // Origin only when that origin is on the allow list, so a Preview or
    // unknown site can never be redirected into (or impersonate) production.
    const storefront = resolveStorefront(config, requestOrigin);
    if (!storefront.ok) {
      console.warn(`[CHECKOUT_ORIGIN] refused checkout from origin not on the allow list`);
      throw new ApiError(403, "This storefront is not allowed to start a checkout.");
    }
    cors = corsHeaders(storefront.origin);

    // Shared (database-backed) limit per client address and store. If the
    // counter itself fails, let the request through and log it: the same
    // database serves the order write, so a real outage still fails safely.
    const limitKey = `checkout:${storeId}:${clientAddress(request.headers)}`;
    try {
      const decision = await consume(prismadb, limitKey, CHECKOUT_RATE_LIMIT);
      if (!decision.allowed) {
        return new NextResponse("Too many checkout attempts. Please wait a few minutes and try again.", {
          status: 429,
          headers: { ...cors, "Retry-After": String(decision.retryAfterSeconds) },
        });
      }
    } catch (limitError) {
      console.error("[CHECKOUT_RATE_LIMIT]", limitError);
    }

    const { productIds } = await parseBody(request, checkoutSchema);

    // Only sell products that belong to this store and are still available.
    // Sold products are archived by the webhook, so this also blocks re-buying them.
    const products = await prismadb.product.findMany({
      where: { id: { in: productIds }, storeId, isArchived: false, isInStock: true },
    });
    if (products.length === 0) throw new ApiError(400, "No available products");

    // Reject the whole cart if any requested item is unavailable, rather than
    // silently charging for the available subset. `productIds` is already
    // de-duplicated by the schema.
    const available = new Set(products.map((product) => product.id));
    const unavailable = productIds.filter((id) => !available.has(id));
    if (unavailable.length > 0) {
      throw new ApiError(400, "Some items in your cart are no longer available. Please review your cart and try again.");
    }

    // Price each item once, in exact integer minor units. The same amount is
    // sent to Stripe and recorded on the order, so they can't disagree.
    const currency = CHECKOUT_CURRENCY;
    const priced = products.map((product) => {
      const unitAmount = toMinorUnits(product.price, currency);
      return { product, unitAmount, unitPrice: fromMinorUnits(unitAmount, currency) };
    });

    // A positive catalog price can still round down to zero minor units (e.g.
    // $0.004 -> 0 cents); don't create a free line item.
    if (priced.some(({ unitAmount }) => unitAmount <= 0)) {
      throw new ApiError(400, "One or more items cost less than the smallest chargeable amount.");
    }

    // Stripe rejects charges below its per-currency minimum; validate in exact
    // integer minor units so the client gets a clear error, not a generic 500.
    const minCharge = minChargeMinorUnits(currency);
    const total = priced.reduce((sum, { unitAmount }) => sum + unitAmount, 0);
    if (total < minCharge) {
      throw new ApiError(400, `Order total must be at least $${formatMinorUnits(minCharge, currency)}.`);
    }

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = priced.map(({ product, unitAmount }) => ({
      quantity: 1,
      price_data: {
        currency,
        product_data: { name: product.name, metadata: { productId: product.id } },
        unit_amount: unitAmount,
      },
    }));

    const order = await prismadb.order.create({
      data: {
        storeId,
        isPaid: false,
        orderItems: {
          create: priced.map(({ product, unitPrice }) => ({
            product: { connect: { id: product.id } },
            unitPrice,
            currency,
          })),
        },
      },
    });

    let session: Stripe.Checkout.Session;
    try {
      session = await getStripe().checkout.sessions.create({
        line_items,
        mode: "payment",
        billing_address_collection: "required",
        phone_number_collection: { enabled: true },
        expires_at: Math.floor(Date.now() / 1000) + SESSION_EXPIRY_SECONDS,
        success_url: `${storefront.baseUrl}/order-success?orderId=${encodeURIComponent(order.id)}`,
        cancel_url: `${storefront.baseUrl}/cart?canceled=1`,
        client_reference_id: order.id,
        metadata: { orderId: order.id },
      });
    } catch (error) {
      // Don't leave an orphaned unpaid order behind if Stripe rejects the session.
      // OrderItem has no cascade, so remove the items first.
      await prismadb
        .$transaction([
          prismadb.orderItem.deleteMany({ where: { orderId: order.id } }),
          prismadb.order.delete({ where: { id: order.id } }),
        ])
        .catch((cleanupError) => console.error("[CHECKOUT_CLEANUP]", cleanupError));
      throw error;
    }

    // Link the session so the webhook can reject payments from any other
    // session. Not fatal if it fails: the customer can still pay, and the
    // webhook links the session (via metadata.orderId) when fulfilling.
    await prismadb.order
      .update({ where: { id: order.id }, data: { stripeSessionId: session.id } })
      .catch((linkError) => console.error("[CHECKOUT_LINK_SESSION]", linkError));

    return NextResponse.json({ url: session.url }, { headers: cors });
  } catch (error) {
    return handleApiError("CHECKOUT_POST", error, { headers: cors });
  }
}
