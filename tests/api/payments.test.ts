import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import { prismaMock, queryRawMock, resetPrismaMock, transactionMock } from "../helpers/prisma-mock";
import { CHECKOUT_RATE_LIMIT } from "@/lib/rate-limit";
import { ctx, jsonRequest } from "../helpers/http";

const stripeMock = vi.hoisted(() => ({
  checkout: { sessions: { create: vi.fn() } },
  webhooks: { constructEvent: vi.fn() },
}));
vi.mock("@/lib/stripe", () => ({ getStripe: () => stripeMock }));
vi.mock("@/lib/prismadb", async () => ({ default: (await import("../helpers/prisma-mock")).prismaMock }));

import * as checkout from "@/app/api/[storeId]/checkout/route";
import * as webhook from "@/app/api/webhook/route";

const decimal = (n: number | string) => new Prisma.Decimal(n);

beforeEach(() => {
  resetPrismaMock();
  prismaMock.order.update.mockResolvedValue({}); // session linking after checkout
  stripeMock.checkout.sessions.create.mockReset();
  stripeMock.webhooks.constructEvent.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  process.env.FRONTEND_STORE_URL = "https://store.example";
  process.env.STRIPE_API_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

describe("POST /api/[storeId]/checkout", () => {
  it("returns 400 (with CORS headers for the storefront origin) for an empty cart", async () => {
    const res = await checkout.POST(
      jsonRequest("/api/s1/checkout", "POST", { productIds: [] }, { Origin: "https://store.example" }),
      ctx({ storeId: "s1" })
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://store.example");
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("sets a short session expiry (Unix seconds) to shrink the double-sell window", async () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: "p1", name: "Lamp", price: decimal(5) }]);
    prismaMock.order.create.mockResolvedValue({ id: "o1" });
    stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" });

    const before = Math.floor(Date.now() / 1000);
    await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }), ctx({ storeId: "s1" }));
    const after = Math.floor(Date.now() / 1000);
    const { expires_at } = stripeMock.checkout.sessions.create.mock.calls[0][0];

    expect(Number.isInteger(expires_at)).toBe(true);
    // Lifetime as seen from this process: 60 minutes, give or take the test's own run time.
    expect(expires_at - before).toBeGreaterThanOrEqual(checkout.SESSION_EXPIRY_SECONDS);
    expect(expires_at - after).toBeLessThanOrEqual(checkout.SESSION_EXPIRY_SECONDS);
    expect(expires_at - before).toBeLessThan(checkout.SESSION_EXPIRY_SECONDS + 60);
  });

  it("keeps a safety margin over Stripe's 30-minute minimum for clock skew and latency", () => {
    expect(checkout.STRIPE_MIN_SESSION_LIFETIME_SECONDS).toBe(30 * 60);
    expect(checkout.SESSION_EXPIRY_MARGIN_SECONDS).toBeGreaterThanOrEqual(60);
    expect(checkout.SESSION_EXPIRY_SECONDS).toBe(60 * 60);
    expect(checkout.SESSION_EXPIRY_SECONDS - checkout.STRIPE_MIN_SESSION_LIFETIME_SECONDS).toBe(checkout.SESSION_EXPIRY_MARGIN_SECONDS);
    // Still well inside Stripe's 24-hour maximum.
    expect(checkout.SESSION_EXPIRY_SECONDS).toBeLessThan(24 * 60 * 60);
  });

  it("only considers this store's unarchived, in-stock products", async () => {
    prismaMock.product.findMany.mockResolvedValue([]);
    const res = await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }), ctx({ storeId: "s1" }));
    expect(prismaMock.product.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["p1"] }, storeId: "s1", isArchived: false, isInStock: true },
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("No available products");
  });

  it("rejects the whole cart when only some items are available, without creating an order", async () => {
    // p2 is unavailable (archived/out of stock), so it isn't returned.
    prismaMock.product.findMany.mockResolvedValue([{ id: "p1", name: "Lamp", price: decimal(20) }]);
    const res = await checkout.POST(
      jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1", "p2"] }),
      ctx({ storeId: "s1" })
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/no longer available/);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("rejects an item whose price rounds down to zero cents", async () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: "p1", name: "Trinket", price: decimal("0.004") }]);
    const res = await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }), ctx({ storeId: "s1" }));
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/smallest chargeable amount/);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it("rejects a total below Stripe's minimum charge", async () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: "p1", name: "Sticker", price: decimal("0.25") }]);
    const res = await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }), ctx({ storeId: "s1" }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Order total must be at least $0.50.");
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it("allows a total that exactly meets the minimum", async () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: "p1", name: "Sticker", price: decimal("0.50") }]);
    prismaMock.order.create.mockResolvedValue({ id: "o1" });
    prismaMock.order.update.mockResolvedValue({ id: "o1" });
    stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" });
    const res = await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }), ctx({ storeId: "s1" }));
    expect(res.status).toBe(200);
    expect(stripeMock.checkout.sessions.create.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(50);
  });

  it("creates an order and a Stripe session with integer cents", async () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: "p1", name: "Lamp", price: decimal(19.99) }]);
    prismaMock.order.create.mockResolvedValue({ id: "o1" });
    prismaMock.order.update.mockResolvedValue({ id: "o1" });
    stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" });

    const res = await checkout.POST(
      jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1", "p1"] }),
      ctx({ storeId: "s1" })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/x" });
    const session = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(session.line_items[0].price_data.unit_amount).toBe(1999);
    expect(session.line_items[0].price_data.currency).toBe("usd");
    expect(session.metadata).toEqual({ orderId: "o1" });
    expect(session.client_reference_id).toBe("o1");
    expect(session.success_url).toBe("https://store.example/order-success?orderId=o1");
    expect(session.cancel_url).toBe("https://store.example/cart?canceled=1");
  });

  it("records exactly the unit price and currency sent to Stripe, rounding half up", async () => {
    // A catalog price with more precision than cents: float math would charge 100.
    prismaMock.product.findMany.mockResolvedValue([
      { id: "p1", name: "Lamp", price: decimal("1.005") },
      { id: "p2", name: "Desk", price: decimal("100.10") },
    ]);
    prismaMock.order.create.mockResolvedValue({ id: "o1" });
    prismaMock.order.update.mockResolvedValue({ id: "o1" });
    stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" });

    await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1", "p2"] }), ctx({ storeId: "s1" }));

    const sent = stripeMock.checkout.sessions.create.mock.calls[0][0].line_items.map(
      (l: any) => l.price_data.unit_amount
    );
    expect(sent).toEqual([101, 10010]);

    const created = prismaMock.order.create.mock.calls[0][0].data.orderItems.create;
    expect(created.map((i: any) => [i.unitPrice.toFixed(2), i.currency])).toEqual([
      ["1.01", "usd"],
      ["100.10", "usd"],
    ]);
    // Recorded prices convert back to exactly what Stripe was asked to charge.
    expect(created.map((i: any) => i.unitPrice.mul(100).toNumber())).toEqual(sent);
  });

  it("links the Stripe session to the order", async () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: "p1", name: "Lamp", price: decimal(5) }]);
    prismaMock.order.create.mockResolvedValue({ id: "o1" });
    prismaMock.order.update.mockResolvedValue({ id: "o1" });
    stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_123", url: "https://checkout.stripe.com/x" });

    await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }), ctx({ storeId: "s1" }));
    expect(prismaMock.order.update).toHaveBeenCalledWith({ where: { id: "o1" }, data: { stripeSessionId: "cs_123" } });
  });

  it("still returns the checkout URL if linking the session fails", async () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: "p1", name: "Lamp", price: decimal(5) }]);
    prismaMock.order.create.mockResolvedValue({ id: "o1" });
    prismaMock.order.update.mockRejectedValue(new Error("db blip"));
    stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" });

    const res = await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }), ctx({ storeId: "s1" }));
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith("[CHECKOUT_LINK_SESSION]", expect.any(Error));
  });

  it("normalizes a trailing slash in FRONTEND_STORE_URL", async () => {
    process.env.FRONTEND_STORE_URL = "https://store.example/shop/";
    prismaMock.product.findMany.mockResolvedValue([{ id: "p1", name: "Lamp", price: decimal(5) }]);
    prismaMock.order.create.mockResolvedValue({ id: "o1" });
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/x" });

    await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }), ctx({ storeId: "s1" }));
    expect(stripeMock.checkout.sessions.create.mock.calls[0][0].success_url).toBe(
      "https://store.example/shop/order-success?orderId=o1"
    );
  });

  it.each([
    ["missing", undefined],
    ["empty", "  "],
    ["not a URL", "store.example"],
    ["wrong scheme", "ftp://store.example"],
    ["plain http on a public host", "http://store.example"],
    ["with credentials", "https://user:secret@store.example"],
  ])("returns 503 before touching the database when FRONTEND_STORE_URL is %s", async (_label, value) => {
    if (value === undefined) delete process.env.FRONTEND_STORE_URL;
    else process.env.FRONTEND_STORE_URL = value;

    const res = await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }), ctx({ storeId: "s1" }));

    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toBe("Checkout is temporarily unavailable due to a server configuration error.");
    expect(body).not.toContain("secret");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
    expect(prismaMock.order.create).not.toHaveBeenCalled();
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    // The variable name (not its value) is logged for the operator.
    expect(console.error).toHaveBeenCalledWith("[CHECKOUT_CONFIG]", expect.stringContaining("FRONTEND_STORE_URL"));
  });

  it("returns 503 without creating an order when STRIPE_API_KEY is missing", async () => {
    delete process.env.STRIPE_API_KEY;
    const res = await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }), ctx({ storeId: "s1" }));
    expect(res.status).toBe(503);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it("allows plain http for localhost during development", async () => {
    process.env.FRONTEND_STORE_URL = "http://localhost:3001";
    prismaMock.product.findMany.mockResolvedValue([]);
    const res = await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }), ctx({ storeId: "s1" }));
    expect(res.status).toBe(400); // got past config validation to the product check
  });

  it("removes the unpaid order when Stripe fails", async () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: "p1", name: "Lamp", price: decimal(10) }]);
    prismaMock.order.create.mockResolvedValue({ id: "o1" });
    stripeMock.checkout.sessions.create.mockRejectedValue(new Error("stripe down"));
    transactionMock.mockResolvedValue([]);

    const res = await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }), ctx({ storeId: "s1" }));

    expect(res.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.orderItem.deleteMany).toHaveBeenCalledWith({ where: { orderId: "o1" } });
    expect(prismaMock.order.delete).toHaveBeenCalledWith({ where: { id: "o1" } });
  });
});

describe("POST /api/[storeId]/checkout: storefront origin isolation", () => {
  const available = () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: "p1", name: "Lamp", price: decimal(5) }]);
    prismaMock.order.create.mockResolvedValue({ id: "o1" });
    stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" });
  };

  it("refuses a browser origin that is not on the allow list before touching the database", async () => {
    available();
    const res = await checkout.POST(
      jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }, { Origin: "https://quick-cart-git-feature-x.vercel.app" }),
      ctx({ storeId: "s1" })
    );
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("This storefront is not allowed to start a checkout.");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
    expect(prismaMock.order.create).not.toHaveBeenCalled();
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("never redirects a Preview origin to production: an allow-listed origin gets its own success/cancel URLs", async () => {
    process.env.ALLOWED_STOREFRONT_ORIGINS = "https://quick-cart-staging.vercel.app";
    available();
    try {
      const res = await checkout.POST(
        jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }, { Origin: "https://quick-cart-staging.vercel.app" }),
        ctx({ storeId: "s1" })
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://quick-cart-staging.vercel.app");
      const session = stripeMock.checkout.sessions.create.mock.calls[0][0];
      expect(session.success_url).toBe("https://quick-cart-staging.vercel.app/order-success?orderId=o1");
      expect(session.cancel_url).toBe("https://quick-cart-staging.vercel.app/cart?canceled=1");
    } finally {
      delete process.env.ALLOWED_STOREFRONT_ORIGINS;
    }
  });

  it("uses FRONTEND_STORE_URL for the production storefront's own origin and for non-browser callers", async () => {
    available();
    await checkout.POST(
      jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }, { Origin: "https://store.example" }),
      ctx({ storeId: "s1" })
    );
    expect(stripeMock.checkout.sessions.create.mock.calls[0][0].success_url).toBe("https://store.example/order-success?orderId=o1");

    stripeMock.checkout.sessions.create.mockClear();
    available();
    await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }), ctx({ storeId: "s1" }));
    expect(stripeMock.checkout.sessions.create.mock.calls[0][0].success_url).toBe("https://store.example/order-success?orderId=o1");
  });

  it("answers the CORS preflight only for allow-listed origins", async () => {
    const allowed = await checkout.OPTIONS(
      new Request("http://localhost/api/s1/checkout", { method: "OPTIONS", headers: { Origin: "https://store.example" } })
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://store.example");
    expect(allowed.headers.get("Access-Control-Allow-Methods")).toContain("POST");

    const refused = await checkout.OPTIONS(
      new Request("http://localhost/api/s1/checkout", { method: "OPTIONS", headers: { Origin: "https://evil.example" } })
    );
    expect(refused.status).toBe(204);
    expect(refused.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("POST /api/[storeId]/checkout: rate limiting", () => {
  const withProduct = () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: "p1", name: "Lamp", price: decimal(5) }]);
    prismaMock.order.create.mockResolvedValue({ id: "o1" });
    stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" });
  };

  it("keys the shared counter by store and client address", async () => {
    withProduct();
    await checkout.POST(
      jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }, { "x-forwarded-for": "203.0.113.9, 10.0.0.1" }),
      ctx({ storeId: "s1" })
    );
    const [, ...values] = queryRawMock.mock.calls[0];
    expect(values).toContain("checkout:s1:203.0.113.9");
  });

  it("returns 429 with Retry-After and creates nothing once the limit is exceeded", async () => {
    withProduct();
    queryRawMock.mockResolvedValue([{ count: CHECKOUT_RATE_LIMIT.limit + 1 }]);
    const res = await checkout.POST(
      jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }, { Origin: "https://store.example" }),
      ctx({ storeId: "s1" })
    );
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://store.example");
    expect(await res.text()).toMatch(/Too many checkout attempts/);
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
    expect(prismaMock.order.create).not.toHaveBeenCalled();
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("allows exactly the limit-th request", async () => {
    withProduct();
    queryRawMock.mockResolvedValue([{ count: CHECKOUT_RATE_LIMIT.limit }]);
    const res = await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }), ctx({ storeId: "s1" }));
    expect(res.status).toBe(200);
  });

  it("fails open (and logs) when the counter store is unavailable", async () => {
    withProduct();
    queryRawMock.mockRejectedValue(new Error("connection reset"));
    const res = await checkout.POST(jsonRequest("/api/s1/checkout", "POST", { productIds: ["p1"] }), ctx({ storeId: "s1" }));
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith("[CHECKOUT_RATE_LIMIT]", expect.any(Error));
  });
});

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

const webhookRequest = () =>
  new Request("http://localhost/api/webhook", {
    method: "POST",
    headers: { "Stripe-Signature": "sig" },
    body: "{}",
  });

function stripeEvent(type: string, session: Record<string, unknown>) {
  return { id: `evt_${Math.random()}`, type, data: { object: session } };
}

// o1 recorded p1 at $20.00 and p2 at $10.00, so Stripe must have charged 3000 cents.
const paidSession = {
  id: "cs_1",
  metadata: { orderId: "o1" },
  payment_status: "paid",
  currency: "usd",
  amount_subtotal: 3000,
  customer_details: { phone: "+1 555", address: { line1: "1 Main St", line2: null, city: "Austin", country: "US" } },
};

interface FakeOptions {
  /** Simulate an order created before prices were recorded. */
  legacy?: boolean;
  /** stripeSessionId stored on the order (null = linking failed at checkout). */
  sessionId?: string | null;
}

/**
 * Minimal in-memory stand-in for the tables the webhook touches, so tests
 * assert on resulting state rather than on which Prisma calls were made.
 */
function fakeDatabase({ legacy = false, sessionId = "cs_1" }: FakeOptions = {}) {
  const price = (v: string) => (legacy ? { unitPrice: null, currency: null } : { unitPrice: decimal(v), currency: "usd" });
  const db = {
    orders: new Map<string, { id: string; isPaid: boolean; address: string; phone: string; stripeSessionId: string | null }>([
      ["o1", { id: "o1", isPaid: false, address: "", phone: "", stripeSessionId: sessionId }],
    ]),
    orderItems: [
      { orderId: "o1", productId: "p1", ...price("20.00") },
      { orderId: "o1", productId: "p2", ...price("10.00") },
    ],
    products: new Map([
      ["p1", { id: "p1", isArchived: false }],
      ["p2", { id: "p2", isArchived: false }],
    ]),
    paymentExceptions: [] as { orderId: string; sessionId: string; reason: string; eventId: string }[],
  };
  const tx = {
    order: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        const order = db.orders.get(where.id);
        // Like SQL: a filter key that is absent matches any value.
        if (!order || (where.isPaid !== undefined && order.isPaid !== where.isPaid)) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const order = db.orders.get(where.id);
        if (!order) return null;
        return {
          ...order,
          orderItems: db.orderItems
            .filter((i) => i.orderId === where.id)
            .map(({ productId, unitPrice, currency }) => ({ productId, unitPrice, currency })),
        };
      }),
    },
    product: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const id of where.id.in) {
          const p = db.products.get(id);
          // Like SQL: a filter key that is absent matches any value.
          if (p && (where.isArchived === undefined || p.isArchived === where.isArchived)) {
            Object.assign(p, data);
            count++;
          }
        }
        return { count };
      }),
    },
    paymentException: {
      // Inside the transaction the webhook uses the transaction client, so
      // the record is governed by the same commit/rollback as the transition.
      // Tests can still make the write fail through prismaMock.paymentException.create.
      create: vi.fn(async (args: any) => {
        const result = await prismaMock.paymentException.create(args);
        if (db.paymentExceptions.some((e) => e.eventId === args.data.eventId)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed on eventId", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        db.paymentExceptions.push({ ...args.data });
        return result ?? { id: `pe_${db.paymentExceptions.length}` };
      }),
    },
  };
  // Postgres semantics: every write inside the callback is discarded if it throws.
  const snapshot = () => ({
    orders: new Map([...db.orders].map(([k, v]) => [k, { ...v }])),
    products: new Map([...db.products].map(([k, v]) => [k, { ...v }])),
    paymentExceptions: db.paymentExceptions.map((e) => ({ ...e })),
  });
  transactionMock.mockImplementation(async (fn: (t: typeof tx) => unknown) => {
    const before = snapshot();
    try {
      return await fn(tx);
    } catch (error) {
      db.orders = before.orders;
      db.products = before.products;
      db.paymentExceptions = before.paymentExceptions;
      throw error;
    }
  });
  return { db, tx };
}

async function deliver(type: string, session: Record<string, unknown>) {
  stripeMock.webhooks.constructEvent.mockReturnValue(stripeEvent(type, session));
  return webhook.POST(webhookRequest());
}

describe("POST /api/webhook: signature", () => {
  it("returns 400 without a signature", async () => {
    const res = await webhook.POST(new Request("http://localhost/api/webhook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the webhook secret is not configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await webhook.POST(webhookRequest());
    expect(res.status).toBe(400);
    expect(stripeMock.webhooks.constructEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when signature verification fails", async () => {
    stripeMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const res = await webhook.POST(webhookRequest());
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("bad signature");
  });

  it("verifies against the raw body, signature and secret", async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue(stripeEvent("ping", {}));
    await webhook.POST(webhookRequest());
    expect(stripeMock.webhooks.constructEvent).toHaveBeenCalledWith("{}", "sig", "whsec_test");
  });
});

describe("POST /api/webhook: payment status", () => {
  it("marks a card-paid order paid and archives its products", async () => {
    const { db } = fakeDatabase();
    const res = await deliver("checkout.session.completed", paidSession);

    expect(res.status).toBe(200);
    expect(db.orders.get("o1")).toMatchObject({ isPaid: true, address: "1 Main St, Austin, US", phone: "+1 555" });
    expect(db.products.get("p1")!.isArchived).toBe(true);
    expect(db.products.get("p2")!.isArchived).toBe(true);
  });

  it.each(["unpaid", "no_payment_required"])(
    "does not mark the order paid when checkout completes with payment_status %s",
    async (status) => {
      const { db } = fakeDatabase();
      const res = await deliver("checkout.session.completed", { ...paidSession, payment_status: status });

      expect(res.status).toBe(200);
      expect(db.orders.get("o1")!.isPaid).toBe(false);
      expect(db.products.get("p1")!.isArchived).toBe(false);
      expect(transactionMock).not.toHaveBeenCalled();
    }
  );

  it("fulfils a delayed payment only when async_payment_succeeded arrives", async () => {
    const { db } = fakeDatabase();

    await deliver("checkout.session.completed", { ...paidSession, payment_status: "unpaid" });
    expect(db.orders.get("o1")!.isPaid).toBe(false); // pending

    const res = await deliver("checkout.session.async_payment_succeeded", paidSession);
    expect(res.status).toBe(200);
    expect(db.orders.get("o1")!.isPaid).toBe(true);
    expect(db.products.get("p1")!.isArchived).toBe(true);
  });

  it("does not trust an async_payment_succeeded event whose session isn't paid", async () => {
    const { db } = fakeDatabase();
    await deliver("checkout.session.async_payment_succeeded", { ...paidSession, payment_status: "unpaid" });
    expect(db.orders.get("o1")!.isPaid).toBe(false);
  });

  it("leaves the order unpaid when a delayed payment fails", async () => {
    const { db } = fakeDatabase();
    const res = await deliver("checkout.session.async_payment_failed", { ...paidSession, payment_status: "unpaid" });

    expect(res.status).toBe(200);
    expect(db.orders.get("o1")!.isPaid).toBe(false);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("async payment failed for order o1"));
  });

  it.each(["payment_intent.succeeded", "checkout.session.expired", "charge.refunded"])(
    "acknowledges unexpected event %s without touching the database",
    async (type) => {
      fakeDatabase();
      const res = await deliver(type, paidSession);
      expect(res.status).toBe(200);
      expect(transactionMock).not.toHaveBeenCalled();
    }
  );

  it("ignores paid sessions that weren't created by our checkout (no orderId)", async () => {
    fakeDatabase();
    const res = await deliver("checkout.session.completed", { ...paidSession, metadata: {} });
    expect(res.status).toBe(200);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhook: idempotency", () => {
  it("a duplicate delivery doesn't undo an admin's later un-archive", async () => {
    const { db, tx } = fakeDatabase();

    await deliver("checkout.session.completed", paidSession);
    expect(db.products.get("p1")!.isArchived).toBe(true);

    // The admin deliberately restores p1 to the catalog...
    db.products.get("p1")!.isArchived = false;

    // ...then Stripe re-delivers the same event (retry or duplicate).
    const res = await deliver("checkout.session.completed", paidSession);

    expect(res.status).toBe(200);
    expect(db.products.get("p1")!.isArchived).toBe(false);
    expect(tx.product.updateMany).toHaveBeenCalledTimes(1); // only the first delivery archived
  });

  it("completed followed by async_payment_succeeded fulfils only once", async () => {
    const { tx } = fakeDatabase();
    await deliver("checkout.session.completed", paidSession);
    await deliver("checkout.session.async_payment_succeeded", paidSession);
    expect(tx.product.updateMany).toHaveBeenCalledTimes(1);
  });

  it("acknowledges a paid session for an order that no longer exists", async () => {
    const { db, tx } = fakeDatabase();
    db.orders.clear();

    const res = await deliver("checkout.session.completed", paidSession);

    expect(res.status).toBe(200);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("unknown order o1"));
  });

  it("returns 500 so Stripe retries when the database write fails", async () => {
    transactionMock.mockRejectedValue(new Error("db down"));
    const res = await deliver("checkout.session.completed", paidSession);
    expect(res.status).toBe(500);
  });
});

describe("POST /api/webhook: recorded price verification", () => {
  it("records the paying session on fulfilment", async () => {
    const { db } = fakeDatabase({ sessionId: null }); // linking failed at checkout
    await deliver("checkout.session.completed", paidSession);
    expect(db.orders.get("o1")).toMatchObject({ isPaid: true, stripeSessionId: "cs_1" });
  });

  it.each([
    ["amount differs by one cent", { amount_subtotal: 2999 }, /amount mismatch/],
    ["currency differs", { currency: "eur" }, /currency mismatch/],
    ["session is not the one linked to the order", { id: "cs_attacker" }, /different session/],
  ])("does not fulfil when the %s", async (_label, overrides, reason) => {
    const { db, tx } = fakeDatabase();

    const res = await deliver("checkout.session.completed", { ...paidSession, ...overrides });

    expect(res.status).toBe(200); // retrying can't fix a mismatch
    expect(db.orders.get("o1")!.isPaid).toBe(false);
    expect(db.products.get("p1")!.isArchived).toBe(false);
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`STRIPE_WEBHOOK_REJECTED.*${reason.source}`)));
  });

  it("a rejected session stays rejected on redelivery", async () => {
    const { db, tx } = fakeDatabase();
    const bad = { ...paidSession, amount_subtotal: 1 };
    await deliver("checkout.session.completed", bad);
    await deliver("checkout.session.completed", bad);
    expect(db.orders.get("o1")!.isPaid).toBe(false);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it("fulfils a legacy order without recorded prices, and flags it", async () => {
    const { db } = fakeDatabase({ legacy: true });
    const res = await deliver("checkout.session.completed", { ...paidSession, amount_subtotal: 12345 });

    expect(res.status).toBe(200);
    expect(db.orders.get("o1")!.isPaid).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("legacy order o1"));
  });

  it("a retry after a transient failure fulfils exactly once", async () => {
    const { db, tx } = fakeDatabase();
    const realTransaction = transactionMock.getMockImplementation()!;
    transactionMock.mockImplementationOnce(async () => {
      throw new Error("connection reset");
    });

    const first = await deliver("checkout.session.completed", paidSession);
    expect(first.status).toBe(500); // Stripe will retry
    expect(db.orders.get("o1")!.isPaid).toBe(false);

    transactionMock.mockImplementation(realTransaction);
    const retry = await deliver("checkout.session.completed", paidSession);
    const duplicate = await deliver("checkout.session.completed", paidSession);

    expect(retry.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(db.orders.get("o1")!.isPaid).toBe(true);
    expect(tx.product.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/webhook: durable mismatch recording", () => {
  const p2002 = () =>
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });

  it("stores a mismatch as a PaymentException (ids/reason only, no PII) and acks", async () => {
    const { db } = fakeDatabase();
    prismaMock.paymentException.create.mockResolvedValue({ id: "pe1" });

    const res = await deliver("checkout.session.completed", { ...paidSession, amount_subtotal: 2999 });

    expect(res.status).toBe(200);
    expect(db.orders.get("o1")!.isPaid).toBe(false);
    expect(prismaMock.paymentException.create).toHaveBeenCalledTimes(1);
    const data = prismaMock.paymentException.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ orderId: "o1", sessionId: "cs_1", reason: expect.stringMatching(/amount mismatch/) });
    expect(typeof data.eventId).toBe("string");
    // No customer PII fields are persisted.
    expect(Object.keys(data).sort()).toEqual(["eventId", "orderId", "reason", "sessionId"]);
  });

  it("treats a redelivered event (unique eventId) as already recorded and still acks", async () => {
    fakeDatabase();
    prismaMock.paymentException.create.mockRejectedValue(p2002());

    const res = await deliver("checkout.session.completed", { ...paidSession, currency: "eur" });

    expect(res.status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("already recorded"));
  });

  it("returns 500 so Stripe retries when recording the mismatch fails", async () => {
    fakeDatabase();
    prismaMock.paymentException.create.mockRejectedValue(new Error("db down"));

    const res = await deliver("checkout.session.completed", { ...paidSession, amount_subtotal: 1 });

    expect(res.status).toBe(500);
  });
});

describe("POST /api/webhook: oversell (nothing is reserved at checkout)", () => {
  it("flags a paid order whose item was already sold to an earlier order, instead of fulfilling it silently", async () => {
    const { db, tx } = fakeDatabase();
    // Another shopper's payment for p1 arrived first while this session was still open.
    db.products.get("p1")!.isArchived = true;
    prismaMock.paymentException.create.mockResolvedValue({ id: "pe1" });

    const res = await deliver("checkout.session.completed", paidSession);

    expect(res.status).toBe(200);
    // The money was taken, so the order is paid and the still-available item is archived...
    expect(db.orders.get("o1")!.isPaid).toBe(true);
    expect(db.products.get("p2")!.isArchived).toBe(true);
    // ...and the shortfall is recorded durably for a refund, inside the same transaction.
    expect(tx.paymentException.create).toHaveBeenCalledTimes(1);
    expect(db.paymentExceptions).toHaveLength(1);
    expect(db.paymentExceptions[0]).toMatchObject({
      orderId: "o1",
      sessionId: "cs_1",
      reason: expect.stringMatching(/oversold: 1 of 2/),
      eventId: expect.any(String),
    });
    // Only ids/reason are stored, never customer PII.
    expect(Object.keys(db.paymentExceptions[0]).sort()).toEqual(["eventId", "orderId", "reason", "sessionId"]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("STRIPE_WEBHOOK_OVERSOLD"));
  });

  it("does not record an exception when every item was still available", async () => {
    const { db, tx } = fakeDatabase();
    await deliver("checkout.session.completed", paidSession);
    expect(tx.paymentException.create).not.toHaveBeenCalled();
    expect(db.paymentExceptions).toEqual([]);
  });

  it("rolls back the paid transition and the archive when the oversell record cannot be written, and returns 500", async () => {
    const { db } = fakeDatabase();
    db.products.get("p1")!.isArchived = true;
    prismaMock.paymentException.create.mockRejectedValue(new Error("db down"));

    const res = await deliver("checkout.session.completed", paidSession);

    expect(res.status).toBe(500); // Stripe will retry
    // Nothing from the failed attempt is left behind: the order is still
    // unpaid and p2 is still on sale, exactly as before the delivery.
    expect(db.orders.get("o1")).toMatchObject({ isPaid: false, address: "", phone: "" });
    expect(db.products.get("p2")!.isArchived).toBe(false);
    expect(db.paymentExceptions).toEqual([]);
  });

  it("a retry after a failed record write fulfils once and records the oversell once; a further duplicate changes nothing", async () => {
    const { db, tx } = fakeDatabase();
    db.products.get("p1")!.isArchived = true;
    // First delivery: the exception insert fails -> whole transaction rolled back.
    prismaMock.paymentException.create.mockRejectedValueOnce(new Error("connection reset"));
    prismaMock.paymentException.create.mockResolvedValue({ id: "pe1" });
    stripeMock.webhooks.constructEvent.mockReturnValue(stripeEvent("checkout.session.completed", paidSession));

    const first = await webhook.POST(webhookRequest());
    expect(first.status).toBe(500);
    expect(db.orders.get("o1")!.isPaid).toBe(false);
    expect(db.paymentExceptions).toEqual([]);

    // Stripe redelivers the same event (same id): the transition and the record commit together.
    const retry = await webhook.POST(webhookRequest());
    expect(retry.status).toBe(200);
    expect(db.orders.get("o1")!.isPaid).toBe(true);
    expect(db.products.get("p2")!.isArchived).toBe(true);
    expect(db.paymentExceptions).toHaveLength(1);

    // A third delivery of the same event is a no-op: no second transition, no second record.
    const duplicate = await webhook.POST(webhookRequest());
    expect(duplicate.status).toBe(200);
    expect(tx.order.updateMany).toHaveBeenCalledTimes(2); // first (rolled back) + retry; duplicate stops at isPaid
    expect(tx.product.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.paymentException.create).toHaveBeenCalledTimes(2); // failed attempt + the committed one
    expect(db.paymentExceptions).toHaveLength(1);
    expect(db.orders.get("o1")!.isPaid).toBe(true);
  });
});
