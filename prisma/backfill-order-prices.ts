/**
 * Backfills OrderItem.unitPrice/currency for paid orders created before price
 * tracking, using ONLY the amounts Stripe actually charged (Checkout Session
 * line items). Orders without a matching paid session stay NULL ("not
 * recorded") and keep showing as estimates. Current catalog prices are never
 * written as historical prices.
 *
 * Dry run by default (reads Stripe and the database, writes nothing):
 *   npx tsx prisma/backfill-order-prices.ts
 * Write the matches, after reviewing the dry-run report:
 *   npx tsx prisma/backfill-order-prices.ts --apply
 *
 * Never runs automatically (not wired into build, postinstall or migrations).
 */
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";

import { checkBackfillApplyAllowed, matchLineItems } from "../lib/backfill";
import { fromMinorUnits, minorUnitDigits } from "../lib/money";

// tsx doesn't load .env; Prisma would, but only after STRIPE_API_KEY is read.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on variables already set in the environment.
}

const apply = process.argv.includes("--apply");

async function main() {
  const stripeKey = process.env.STRIPE_API_KEY;
  if (!stripeKey) throw new Error("STRIPE_API_KEY is not set");
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").hostname;
    } catch {
      return "(unparsable DATABASE_URL)";
    }
  })();

  console.log(`Mode: ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"} | database: ${host}\n`);

  // --apply mutates data: refuse on production and require explicit host confirmation.
  if (apply) {
    const guard = checkBackfillApplyAllowed(host, process.env);
    if (!guard.allowed) {
      console.error(guard.reason);
      process.exitCode = 1;
      return;
    }
  }

  const prisma = new PrismaClient();
  const stripe = new Stripe(stripeKey);

  try {
    const candidates = await prisma.order.findMany({
      where: { isPaid: true, orderItems: { some: { unitPrice: null } } },
      select: {
        id: true,
        createdAt: true,
        stripeSessionId: true,
        orderItems: { select: { id: true, productId: true, unitPrice: true, product: { select: { name: true } } } },
      },
    });
    console.log(`Paid orders missing prices: ${candidates.length}`);
    if (candidates.length === 0) return;

    // Stripe can't search sessions by metadata, so list sessions created since
    // the oldest candidate order and match on metadata.orderId.
    const byId = new Map(candidates.map((order) => [order.id, order]));
    const oldest = Math.floor(Math.min(...candidates.map((o) => o.createdAt.getTime())) / 1000) - 86_400;
    const sessions = new Map<string, Stripe.Checkout.Session>();
    for await (const session of stripe.checkout.sessions.list({ limit: 100, created: { gte: oldest } })) {
      const orderId = session.metadata?.orderId;
      if (orderId && byId.has(orderId) && session.payment_status === "paid") sessions.set(orderId, session);
    }

    const report = { matched: 0, written: 0, skipped: [] as string[], noSession: 0 };

    for (const order of candidates) {
      const session = sessions.get(order.id);
      if (!session) {
        report.noSession++;
        continue;
      }
      if (order.stripeSessionId && order.stripeSessionId !== session.id) {
        report.skipped.push(`${order.id}: linked to a different session`);
        continue;
      }
      if (order.orderItems.some((item) => item.unitPrice !== null)) {
        report.skipped.push(`${order.id}: partially recorded; needs manual review`);
        continue;
      }

      const lines = await stripe.checkout.sessions.listLineItems(session.id, {
        limit: 100,
        expand: ["data.price.product"],
      });
      const match = matchLineItems(
        order.orderItems.map((item) => ({ id: item.id, productId: item.productId, productName: item.product.name })),
        lines.data.map((line) => {
          const product = line.price?.product;
          const productId = product && typeof product === "object" && "metadata" in product ? product.metadata?.productId : null;
          return {
            productId: productId ?? null,
            description: line.description,
            quantity: line.quantity,
            amountSubtotal: line.amount_subtotal,
            currency: line.currency,
          };
        }),
        session.amount_subtotal
      );

      if (match.status === "skipped") {
        report.skipped.push(`${order.id}: ${match.reason}`);
        continue;
      }
      report.matched++;

      // Reject currencies we can't represent exactly in DECIMAL(12,2).
      if (match.assignments.some((a) => minorUnitDigits(a.currency) !== 2)) {
        report.skipped.push(`${order.id}: unsupported currency`);
        continue;
      }

      const line = match.assignments
        .map((a) => `${a.orderItemId}=${fromMinorUnits(a.unitAmount, a.currency).toFixed(2)} ${a.currency}`)
        .join(", ");
      console.log(`${apply ? "WRITE" : "would write"} order ${order.id} (session ${session.id}): ${line}`);

      if (apply) {
        await prisma.$transaction(async (tx) => {
          for (const a of match.assignments) {
            // Only fill rows that are still NULL; never overwrite a recorded price.
            await tx.orderItem.updateMany({
              where: { id: a.orderItemId, unitPrice: null },
              data: { unitPrice: fromMinorUnits(a.unitAmount, a.currency), currency: a.currency },
            });
          }
          await tx.order.updateMany({
            where: { id: order.id, stripeSessionId: null },
            data: { stripeSessionId: session.id },
          });
        });
        report.written++;
      }
    }

    console.log(
      `\nMatched: ${report.matched} | written: ${report.written} | no paid session (left NULL): ${report.noSession} | skipped: ${report.skipped.length}`
    );
    report.skipped.forEach((s) => console.log(`  skipped ${s}`));
    if (!apply && report.matched > 0) console.log("\nDry run only. Re-run with --apply to write the matches above.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("BACKFILL FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
