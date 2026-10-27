import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { fromMinorUnits, minChargeMinorUnits, toMinorUnits } from "@/lib/money";
import { verifySessionForOrder, type OrderForPayment } from "@/lib/order-payment";
import { BACKFILL_CONFIRM_FLAG, checkBackfillApplyAllowed, matchLineItems } from "@/lib/backfill";

const D = (v: string | number) => new Prisma.Decimal(v);

describe("toMinorUnits", () => {
  it.each([
    ["19.99", 1999],
    ["20", 2000],
    ["0.01", 1],
    ["1.005", 101], // half up; float math gives 100
    ["19.995", 2000],
    ["19.994999999999", 1999],
    ["1234567.891", 123456789],
  ])("converts %s to %i cents", (price, cents) => {
    expect(toMinorUnits(D(price))).toBe(cents);
  });

  it("is exact where floating point is not", () => {
    expect(1.005 * 100).toBe(100.49999999999999); // the float bug being avoided
    expect(Math.round(1.005 * 100)).toBe(100);
    expect(toMinorUnits("1.005")).toBe(101);
    expect(toMinorUnits(0.1 + 0.2)).toBe(30);
  });

  it("accepts Decimal(65,30)-style values from Product.price", () => {
    expect(toMinorUnits(D("49.990000000000000000000000000000"))).toBe(4999);
  });

  it("rejects negative amounts and unsupported currencies", () => {
    expect(() => toMinorUnits(-1)).toThrow();
    expect(() => toMinorUnits(10, "jpy")).toThrow(/Unsupported currency/);
  });
});

describe("fromMinorUnits", () => {
  it("round-trips exactly", () => {
    expect(fromMinorUnits(2000).toFixed(2)).toBe("20.00");
    expect(fromMinorUnits(1999).equals(D("19.99"))).toBe(true);
    expect(toMinorUnits(fromMinorUnits(123456789))).toBe(123456789);
  });

  it("rejects non-integer or negative minor amounts", () => {
    expect(() => fromMinorUnits(19.5)).toThrow();
    expect(() => fromMinorUnits(-1)).toThrow();
  });
});

describe("verifySessionForOrder", () => {
  const order = (overrides: Partial<OrderForPayment> = {}): OrderForPayment => ({
    id: "o1",
    stripeSessionId: "cs_1",
    orderItems: [
      { unitPrice: D("19.99"), currency: "usd" },
      { unitPrice: D("5.01"), currency: "usd" },
    ],
    ...overrides,
  });
  const session = (overrides: Record<string, unknown> = {}) => ({
    id: "cs_1",
    metadata: { orderId: "o1" },
    currency: "usd",
    amount_subtotal: 2500,
    ...overrides,
  });

  it("accepts a session that charged exactly the recorded prices", () => {
    expect(verifySessionForOrder(session(), order())).toEqual({ ok: true, legacy: false });
  });

  it("accepts an upper-case session currency", () => {
    expect(verifySessionForOrder(session({ currency: "USD" }), order()).ok).toBe(true);
  });

  it("accepts an order not yet linked to a session (link failed at checkout)", () => {
    expect(verifySessionForOrder(session(), order({ stripeSessionId: null })).ok).toBe(true);
  });

  it.each([
    ["amount off by one cent", { amount_subtotal: 2499 }, /amount mismatch/],
    ["missing amount", { amount_subtotal: null }, /amount mismatch/],
    ["different currency", { currency: "eur" }, /currency mismatch/],
    ["different session", { id: "cs_other" }, /different session/],
    ["different order", { metadata: { orderId: "o2" } }, /metadata\.orderId/],
  ])("rejects %s", (_label, overrides, reason) => {
    const result = verifySessionForOrder(session(overrides), order());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(reason);
  });

  it("treats an order without recorded prices as legacy (amount unverifiable)", () => {
    const legacy = order({ orderItems: [{ unitPrice: null, currency: null }] });
    expect(verifySessionForOrder(session({ amount_subtotal: 123 }), legacy)).toEqual({ ok: true, legacy: true });
  });

  it("rejects orders mixing recorded and unrecorded prices, or currencies", () => {
    expect(
      verifySessionForOrder(session(), order({ orderItems: [{ unitPrice: D(1), currency: "usd" }, { unitPrice: null, currency: null }] })).ok
    ).toBe(false);
    expect(
      verifySessionForOrder(session(), order({ orderItems: [{ unitPrice: D(1), currency: "usd" }, { unitPrice: D(1), currency: "eur" }] })).ok
    ).toBe(false);
  });

  it("rejects an order with no items", () => {
    expect(verifySessionForOrder(session(), order({ orderItems: [] })).ok).toBe(false);
  });
});

describe("minChargeMinorUnits", () => {
  it("returns Stripe's USD minimum in cents", () => {
    expect(minChargeMinorUnits("usd")).toBe(50);
  });
  it("throws for an unsupported currency", () => {
    expect(() => minChargeMinorUnits("xyz")).toThrow(/Unsupported currency/);
  });
});

describe("checkBackfillApplyAllowed", () => {
  const host = "db.example.com";

  it("refuses to run in a production/Vercel environment", () => {
    expect(checkBackfillApplyAllowed(host, { NODE_ENV: "production", [BACKFILL_CONFIRM_FLAG]: host }).allowed).toBe(false);
    expect(checkBackfillApplyAllowed(host, { VERCEL: "1", [BACKFILL_CONFIRM_FLAG]: host }).allowed).toBe(false);
  });

  it("refuses without the matching host confirmation", () => {
    expect(checkBackfillApplyAllowed(host, {}).allowed).toBe(false);
    expect(checkBackfillApplyAllowed(host, { [BACKFILL_CONFIRM_FLAG]: "other-host" }).allowed).toBe(false);
  });

  it("allows when the confirmation matches the database host outside production", () => {
    expect(checkBackfillApplyAllowed(host, { [BACKFILL_CONFIRM_FLAG]: host }).allowed).toBe(true);
  });
});

describe("matchLineItems (Stripe backfill)", () => {
  const items = [
    { id: "i1", productId: "p1", productName: "Lamp" },
    { id: "i2", productId: "p2", productName: "Desk" },
  ];
  const line = (o: Partial<Parameters<typeof matchLineItems>[1][number]>) => ({
    productId: null,
    description: "Lamp",
    quantity: 1,
    amountSubtotal: 1000,
    currency: "usd",
    ...o,
  });

  it("matches by product id and takes amounts from Stripe", () => {
    const result = matchLineItems(
      items,
      [line({ productId: "p2", description: "Renamed desk", amountSubtotal: 15000 }), line({ productId: "p1", amountSubtotal: 1999 })],
      16999
    );
    expect(result).toEqual({
      status: "matched",
      assignments: [
        { orderItemId: "i1", unitAmount: 1999, currency: "usd" },
        { orderItemId: "i2", unitAmount: 15000, currency: "usd" },
      ],
    });
  });

  it("matches by unambiguous name when ids are absent", () => {
    const result = matchLineItems(items, [line({ description: "Desk", amountSubtotal: 500 }), line({ amountSubtotal: 700 })], 1200);
    expect(result.status).toBe("matched");
  });

  it.each([
    ["count differs", [line({})], 1000],
    ["quantity > 1", [line({ quantity: 2 }), line({ description: "Desk" })], 2000],
    ["sum differs from session subtotal", [line({}), line({ description: "Desk" })], 9999],
    ["mixed currency", [line({}), line({ description: "Desk", currency: "eur" })], 2000],
    ["ambiguous names", [line({}), line({})], 2000],
  ])("skips when %s", (_label, lines, subtotal) => {
    expect(matchLineItems(items, lines, subtotal).status).toBe("skipped");
  });
});
