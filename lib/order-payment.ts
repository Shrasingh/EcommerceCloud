import type { Prisma } from "@prisma/client";

import { toMinorUnits } from "@/lib/money";

export interface OrderForPayment {
  id: string;
  stripeSessionId: string | null;
  orderItems: { unitPrice: Prisma.Decimal | null; currency: string | null }[];
}

export interface SessionForPayment {
  id: string;
  metadata?: Record<string, string> | null;
  currency?: string | null;
  /** Sum of line items before discounts, taxes and shipping (none are used). */
  amount_subtotal?: number | null;
}

export type PaymentCheck =
  | { ok: true; legacy: false }
  /** Order predates price recording: amount can't be verified. */
  | { ok: true; legacy: true }
  | { ok: false; reason: string };

/**
 * Verifies that a paid Checkout Session belongs to `order` and charged exactly
 * the recorded prices, before the order is fulfilled.
 */
export function verifySessionForOrder(session: SessionForPayment, order: OrderForPayment): PaymentCheck {
  if (session.metadata?.orderId !== order.id) {
    return { ok: false, reason: "session metadata.orderId does not match the order" };
  }
  if (order.stripeSessionId && order.stripeSessionId !== session.id) {
    return { ok: false, reason: `order is linked to a different session (${order.stripeSessionId})` };
  }
  if (order.orderItems.length === 0) {
    return { ok: false, reason: "order has no items" };
  }

  const recorded = order.orderItems.filter((item) => item.unitPrice !== null);
  if (recorded.length === 0) return { ok: true, legacy: true };
  if (recorded.length !== order.orderItems.length) {
    return { ok: false, reason: "order mixes recorded and unrecorded item prices" };
  }

  const currencies = new Set(recorded.map((item) => item.currency));
  if (currencies.size !== 1) return { ok: false, reason: "order items use more than one currency" };
  const [currency] = [...currencies] as string[];

  if (session.currency?.toLowerCase() !== currency) {
    return { ok: false, reason: `currency mismatch: session ${session.currency ?? "none"}, order ${currency}` };
  }

  const expected = recorded.reduce((sum, item) => sum + toMinorUnits(item.unitPrice!, currency), 0);
  if (session.amount_subtotal !== expected) {
    return {
      ok: false,
      reason: `amount mismatch: session ${session.amount_subtotal ?? "none"}, order ${expected} (minor units)`,
    };
  }

  return { ok: true, legacy: false };
}
