// Matching logic for prisma/backfill-order-prices.ts. Prices come only from
// Stripe line items (what was actually charged); product names/ids are used
// solely to pair line items with order items, never as a price source.

export interface BackfillOrderItem {
  id: string;
  productId: string;
  productName: string;
}

export interface BackfillLineItem {
  /** Our product id, if the session stored it in product metadata (newer sessions). */
  productId?: string | null;
  description: string | null;
  quantity: number | null;
  /** Line total before discounts, in minor units. */
  amountSubtotal: number;
  currency: string;
}

export type BackfillMatch =
  | { status: "matched"; assignments: { orderItemId: string; unitAmount: number; currency: string }[] }
  | { status: "skipped"; reason: string };

// Writing to --apply mode mutates order prices, so it must never run against
// production, and must make the operator confirm which database they mean.
export const BACKFILL_CONFIRM_FLAG = "BACKFILL_CONFIRM_HOST";

export type BackfillApplyGuard = { allowed: true } | { allowed: false; reason: string };

export function checkBackfillApplyAllowed(
  databaseHost: string,
  env: Record<string, string | undefined>
): BackfillApplyGuard {
  if (env.VERCEL || env.NODE_ENV === "production") {
    return {
      allowed: false,
      reason: "Refusing to run the backfill with --apply in a production/Vercel environment.",
    };
  }
  if (env[BACKFILL_CONFIRM_FLAG] !== databaseHost) {
    return {
      allowed: false,
      reason:
        `--apply will write order prices to the database at "${databaseHost}".\n` +
        `If that is correct, re-run with ${BACKFILL_CONFIRM_FLAG}=${databaseHost}`,
    };
  }
  return { allowed: true };
}

export function matchLineItems(
  orderItems: BackfillOrderItem[],
  lineItems: BackfillLineItem[],
  sessionAmountSubtotal: number | null
): BackfillMatch {
  if (orderItems.length === 0) return { status: "skipped", reason: "order has no items" };
  if (lineItems.length !== orderItems.length) {
    return { status: "skipped", reason: `line item count ${lineItems.length} != order item count ${orderItems.length}` };
  }
  if (lineItems.some((line) => line.quantity !== 1)) {
    return { status: "skipped", reason: "a line item has quantity other than 1" };
  }
  const currencies = new Set(lineItems.map((line) => line.currency.toLowerCase()));
  if (currencies.size !== 1) return { status: "skipped", reason: "line items use more than one currency" };

  const sum = lineItems.reduce((total, line) => total + line.amountSubtotal, 0);
  if (sessionAmountSubtotal !== null && sum !== sessionAmountSubtotal) {
    return { status: "skipped", reason: `line items sum ${sum} != session subtotal ${sessionAmountSubtotal}` };
  }

  // Pair by product id when available, otherwise by an unambiguous name.
  const remaining = [...lineItems];
  const assignments: { orderItemId: string; unitAmount: number; currency: string }[] = [];
  for (const item of orderItems) {
    let index = remaining.findIndex((line) => line.productId && line.productId === item.productId);
    if (index === -1) {
      const byName = remaining
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => !line.productId && line.description === item.productName);
      if (byName.length !== 1) {
        return {
          status: "skipped",
          reason: `cannot unambiguously match "${item.productName}" (${byName.length} candidates)`,
        };
      }
      index = byName[0].i;
    }
    const [line] = remaining.splice(index, 1);
    assignments.push({ orderItemId: item.id, unitAmount: line.amountSubtotal, currency: line.currency.toLowerCase() });
  }

  return { status: "matched", assignments };
}
