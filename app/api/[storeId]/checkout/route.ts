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
import { ConfigError, getCheckoutConfig, type CheckoutConfig } from "@/lib/config";
import { checkoutSchema } from "@/lib/validations";

// Public endpoint called from the storefront's browser, on another origin.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
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

export async function POST(request: Request, props: { params: Promise<{ storeId: string }> }) {
  try {
    const { storeId } = await props.params;
    const config = loadCheckoutConfig();
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
        success_url: `${config.storefrontUrl}/order-success?orderId=${encodeURIComponent(order.id)}`,
        cancel_url: `${config.storefrontUrl}/cart?canceled=1`,
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

    return NextResponse.json({ url: session.url }, { headers: corsHeaders });
  } catch (error) {
    return handleApiError("CHECKOUT_POST", error, { headers: corsHeaders });
  }
}
