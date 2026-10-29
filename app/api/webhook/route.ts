import Stripe from "stripe";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getStripe } from "@/lib/stripe";
import prismadb from "@/lib/prismadb";
import { formatAddress } from "@/lib/orders";
import { classifyCheckoutEvent } from "@/lib/stripe-events";
import { verifySessionForOrder } from "@/lib/order-payment";

type FulfilmentOutcome =
  | {
      status: "fulfilled";
      legacy: boolean;
      /** Items that were already archived (sold to an earlier order) when this payment arrived. */
      oversold: number;
      itemCount: number;
    }
  | { status: "already_paid" }
  | { status: "order_missing" }
  | { status: "rejected"; reason: string };

/**
 * Writes a PaymentException for manual review. A redelivery of the same event
 * hits the unique eventId and is a no-op; any other write failure propagates
 * so the caller returns 500 and Stripe retries (the record is never lost).
 * Only ids/amounts/reasons are stored, no PII.
 */
async function recordPaymentException(orderId: string, sessionId: string, reason: string, eventId: string) {
  try {
    await prismadb.paymentException.create({ data: { orderId, sessionId, reason, eventId } });
  } catch (recordError) {
    if (recordError instanceof Prisma.PrismaClientKnownRequestError && recordError.code === "P2002") {
      console.warn(`[STRIPE_WEBHOOK] exception already recorded for event ${eventId}`);
      return;
    }
    throw recordError;
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("Stripe-Signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return new NextResponse("Webhook Error: missing signature or secret", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid payload";
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
  }

  const decision = classifyCheckoutEvent(event);

  if (decision.action === "ignore") {
    // Acknowledge so Stripe doesn't retry events we intentionally skip.
    return new NextResponse(null, { status: 200 });
  }

  if (decision.action === "payment_failed") {
    // The order stays unpaid; there is no failure state to record yet.
    console.warn(`[STRIPE_WEBHOOK] async payment failed for order ${decision.orderId}`);
    return new NextResponse(null, { status: 200 });
  }

  const { orderId, session } = decision;
  try {
    const outcome = await prismadb.$transaction(async (tx): Promise<FulfilmentOutcome> => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          isPaid: true,
          stripeSessionId: true,
          orderItems: { select: { productId: true, unitPrice: true, currency: true } },
        },
      });
      if (!order) return { status: "order_missing" };
      if (order.isPaid) return { status: "already_paid" };

      // The session must belong to this order and charge exactly the recorded
      // prices; otherwise don't fulfil.
      const check = verifySessionForOrder(session, order);
      if (!check.ok) return { status: "rejected", reason: check.reason };

      // Only the delivery that flips the order from unpaid to paid continues.
      // Duplicate or retried deliveries match zero rows, so they can't
      // re-archive products an admin has since restored. Concurrent
      // deliveries serialize on the row lock; exactly one gets count = 1.
      const transition = await tx.order.updateMany({
        where: { id: orderId, isPaid: false },
        data: {
          isPaid: true,
          stripeSessionId: session.id,
          address: formatAddress(session.customer_details?.address),
          phone: session.customer_details?.phone ?? "",
        },
      });
      if (transition.count === 0) return { status: "already_paid" };

      // Archive the sold items. Each product is a single unit: one that is
      // already archived was sold to an earlier order while this session was
      // open (nothing is reserved at checkout), so this payment is an
      // oversell. Only still-available items are archived here; the shortfall
      // is reported for a refund instead of being silently fulfilled.
      const productIds = order.orderItems.map((item) => item.productId);
      const archived = await tx.product.updateMany({
        where: { id: { in: productIds }, isArchived: false },
        data: { isArchived: true },
      });
      const oversold = productIds.length - archived.count;

      // The reconciliation record is written in the same transaction as the
      // paid transition, so either both commit or neither does. If it were
      // written afterwards and failed, Stripe's retry would find the order
      // already paid, acknowledge, and the oversell would never be recorded.
      // The unique eventId cannot collide here: only the delivery that wins
      // the transition reaches this line, and a redelivery returns
      // "already_paid" above.
      if (oversold > 0) {
        await tx.paymentException.create({
          data: {
            orderId,
            sessionId: session.id,
            reason: `oversold: ${oversold} of ${productIds.length} item(s) were already sold to an earlier order; refund required`,
            eventId: event.id,
          },
        });
      }
      return { status: "fulfilled", legacy: check.legacy, oversold, itemCount: productIds.length };
    });

    if (outcome.status === "order_missing") {
      // Retrying won't make the order appear; log for investigation and ack.
      console.warn(`[STRIPE_WEBHOOK] paid session for unknown order ${orderId}`);
    } else if (outcome.status === "rejected") {
      // Payment was taken but doesn't match the order. Record it durably for
      // manual review before acknowledging.
      await recordPaymentException(orderId, session.id, outcome.reason, event.id);
      console.error(`[STRIPE_WEBHOOK_REJECTED] order ${orderId}, session ${session.id}: ${outcome.reason}`);
    } else if (outcome.status === "fulfilled") {
      if (outcome.oversold > 0) {
        // The customer paid for an item that had already been sold. The order
        // is marked paid (the money was taken) and the PaymentException
        // flagging it for a refund was committed with the transition above.
        console.error(
          `[STRIPE_WEBHOOK_OVERSOLD] order ${orderId}, session ${session.id}: ${outcome.oversold} of ${outcome.itemCount} item(s) already sold; refund required`
        );
      }
      if (outcome.legacy) {
        console.warn(`[STRIPE_WEBHOOK] fulfilled legacy order ${orderId} without recorded prices`);
      }
    }
  } catch (error) {
    // A 500 makes Stripe retry delivery later.
    console.error("[STRIPE_WEBHOOK]", error);
    return new NextResponse("Webhook handler failed", { status: 500 });
  }

  return new NextResponse(null, { status: 200 });
}
