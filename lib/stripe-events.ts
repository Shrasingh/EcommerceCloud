import type Stripe from "stripe";

export type CheckoutEventAction =
  | { action: "fulfill"; orderId: string; session: Stripe.Checkout.Session }
  | { action: "payment_failed"; orderId: string }
  | { action: "ignore"; reason: string };

/**
 * Decides what a Stripe event means for an order. An order is fulfilled only
 * when Stripe reports the Checkout Session as `paid`:
 *
 * - Card payments: `checkout.session.completed` with payment_status "paid".
 * - Delayed methods (e.g. ACH, SEPA debit): `completed` arrives with "unpaid";
 *   fulfilment waits for `checkout.session.async_payment_succeeded`.
 * - `checkout.session.async_payment_failed`: the order stays unpaid.
 */
export function classifyCheckoutEvent(event: Stripe.Event): CheckoutEventAction {
  const handled = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
  ]);
  if (!handled.has(event.type)) return { action: "ignore", reason: `unhandled event type ${event.type}` };

  const session = event.data.object as Stripe.Checkout.Session;
  const orderId = session.metadata?.orderId;
  if (!orderId) return { action: "ignore", reason: "session has no orderId metadata" };

  if (event.type === "checkout.session.async_payment_failed") {
    return { action: "payment_failed", orderId };
  }

  if (session.payment_status !== "paid") {
    return { action: "ignore", reason: `payment_status is "${session.payment_status}"` };
  }

  return { action: "fulfill", orderId, session };
}
