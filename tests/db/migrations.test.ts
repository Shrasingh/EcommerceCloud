// Applies the real migration SQL files to an in-process Postgres (PGlite) and
// checks the order-price migration against pre-existing data. No network or
// external database is involved.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(__dirname, "../../prisma/migrations");
const migration = (name: string) => readFileSync(path.join(MIGRATIONS, name, "migration.sql"), "utf8");
const PRICE_MIGRATION = "20261024120000_order_price_snapshot";
const PAYMENT_EXCEPTION_MIGRATION = "20261026120000_payment_exception";

let db: PGlite;

/** Rows shaped like the live data before the migration (no prices recorded). */
async function seedLegacyData() {
  await db.exec(`
    INSERT INTO "Store" (id, name, "userId", "updatedAt") VALUES ('s1', 'Store', 'u1', now());
    INSERT INTO "Billboard" (id, "storeId", label, "imageUrl", "updatedAt") VALUES ('b1', 's1', 'B', 'https://x/y.jpg', now());
    INSERT INTO "Category" (id, "storeId", "billboardId", name, "updatedAt") VALUES ('c1', 's1', 'b1', 'C', now());
    INSERT INTO "Size" (id, "storeId", name, value, "updatedAt") VALUES ('z1', 's1', 'S', 'S', now());
    INSERT INTO "Color" (id, "storeId", name, value, "updatedAt") VALUES ('k1', 's1', 'Red', '#f00', now());
    INSERT INTO "Product" (id, "storeId", "categoryId", name, price, "sizeId", "colorId", "updatedAt")
      VALUES ('p1', 's1', 'c1', 'Lamp', 19.99, 'z1', 'k1', now());
    INSERT INTO "Order" (id, "storeId", "isPaid", "updatedAt") VALUES ('o1', 's1', true, now()), ('o2', 's1', false, now());
    INSERT INTO "OrderItem" (id, "orderId", "productId") VALUES ('i1', 'o1', 'p1'), ('i2', 'o2', 'p1');
  `);
}

const count = async (table: string) =>
  Number((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n);

// One database per file (booting Postgres is the slow part): migrate the
// schema, insert legacy rows, then apply the price migration on top of them.
// Each test runs in a transaction that is rolled back afterwards.
beforeAll(async () => {
  db = new PGlite();
  await db.exec(migration("0_init"));
  await seedLegacyData();
  await db.exec(migration(PRICE_MIGRATION));
  await db.exec(migration(PAYMENT_EXCEPTION_MIGRATION));
}, 60_000);
afterAll(async () => db?.close());
beforeEach(async () => db.exec("BEGIN"));
afterEach(async () => db.exec("ROLLBACK"));

describe("migrations", () => {
  it("are applied in the order Prisma uses (lexicographic folder names)", () => {
    const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(folders).toEqual([...folders].sort());
    expect(folders).toEqual(["0_init", PRICE_MIGRATION, PAYMENT_EXCEPTION_MIGRATION]);
  });

  it("contain no destructive statements", () => {
    const sql = migration(PRICE_MIGRATION);
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE|RENAME|ALTER\s+COLUMN|SET\s+NOT\s+NULL)\b/i);
  });
});

describe(`${PRICE_MIGRATION} on existing data`, () => {
  it("keeps every existing row and leaves legacy prices NULL", async () => {
    expect(await count("Order")).toBe(2);
    expect(await count("OrderItem")).toBe(2);
    expect(await count("Product")).toBe(1);

    const items = await db.query(`SELECT "unitPrice", currency FROM "OrderItem" ORDER BY id`);
    expect(items.rows).toEqual([
      { unitPrice: null, currency: null },
      { unitPrice: null, currency: null },
    ]);
    const orders = await db.query(`SELECT "stripeSessionId" FROM "Order"`);
    expect(orders.rows.every((r: any) => r.stripeSessionId === null)).toBe(true);
  });

  it("stores prices with exactly two decimal places", async () => {
    await db.exec(`INSERT INTO "OrderItem" (id, "orderId", "productId", "unitPrice", currency) VALUES ('i3', 'o2', 'p1', 1.01, 'usd')`);
    const row = await db.query<{ v: string }>(`SELECT "unitPrice"::text AS v FROM "OrderItem" WHERE id = 'i3'`);
    expect(row.rows[0].v).toBe("1.01");
  });

  it.each([
    ["price without currency", `20.00, NULL`],
    ["currency without price", `NULL, 'usd'`],
  ])("rejects a %s", async (_label, values) => {
    await expect(
      db.exec(`INSERT INTO "OrderItem" (id, "orderId", "productId", "unitPrice", currency) VALUES ('bad', 'o2', 'p1', ${values})`)
    ).rejects.toThrow(/OrderItem_unitPrice_currency_together/);
  });

  it.each(["USD", "us", "dollars"])("rejects currency %s", async (currency) => {
    await expect(
      db.exec(`INSERT INTO "OrderItem" (id, "orderId", "productId", "unitPrice", currency) VALUES ('bad', 'o2', 'p1', 1, '${currency}')`)
    ).rejects.toThrow();
  });

  it("rejects backfilling only one of the two columns on a legacy row", async () => {
    await expect(db.exec(`UPDATE "OrderItem" SET "unitPrice" = 19.99 WHERE id = 'i1'`)).rejects.toThrow(
      /OrderItem_unitPrice_currency_together/
    );
  });

  it("accepts backfilling both columns together on a legacy row", async () => {
    await db.exec(`UPDATE "OrderItem" SET "unitPrice" = 19.99, currency = 'usd' WHERE id = 'i1'`);
    const row = await db.query(`SELECT "unitPrice"::text AS p, currency FROM "OrderItem" WHERE id = 'i1'`);
    expect(row.rows[0]).toEqual({ p: "19.99", currency: "usd" });
  });

  it("allows many orders without a session but not two orders with the same session", async () => {
    await db.exec(`UPDATE "Order" SET "stripeSessionId" = 'cs_1' WHERE id = 'o1'`);
    await expect(db.exec(`UPDATE "Order" SET "stripeSessionId" = 'cs_1' WHERE id = 'o2'`)).rejects.toThrow(
      /Order_stripeSessionId_key/
    );
  });
});

describe(`${PAYMENT_EXCEPTION_MIGRATION} (payment mismatch log)`, () => {
  it("is additive: no destructive statements", () => {
    const sql = migration(PAYMENT_EXCEPTION_MIGRATION);
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE|RENAME|ALTER\s+COLUMN|SET\s+NOT\s+NULL)\b/i);
  });

  it("stores a mismatch and defaults it to unresolved", async () => {
    await db.exec(
      `INSERT INTO "PaymentException" (id, "orderId", "sessionId", reason, "eventId") VALUES ('pe1', 'o1', 'cs_1', 'amount mismatch', 'evt_1')`
    );
    const row = await db.query<{ resolved: boolean; resolvedAt: unknown }>(
      `SELECT resolved, "resolvedAt" FROM "PaymentException" WHERE id = 'pe1'`
    );
    expect(row.rows[0]).toEqual({ resolved: false, resolvedAt: null });
  });

  it("records each Stripe event at most once (unique eventId)", async () => {
    await db.exec(
      `INSERT INTO "PaymentException" (id, "orderId", "sessionId", reason, "eventId") VALUES ('pe1', 'o1', 'cs_1', 'amount mismatch', 'evt_dup')`
    );
    await expect(
      db.exec(
        `INSERT INTO "PaymentException" (id, "orderId", "sessionId", reason, "eventId") VALUES ('pe2', 'o1', 'cs_1', 'amount mismatch', 'evt_dup')`
      )
    ).rejects.toThrow(/PaymentException_eventId_key/);
  });

  it("does not require the order to exist (no foreign key), so unknown-order mismatches can be logged", async () => {
    await db.exec(
      `INSERT INTO "PaymentException" (id, "orderId", "sessionId", reason, "eventId") VALUES ('pe3', 'ghost-order', 'cs_x', 'session metadata.orderId does not match the order', 'evt_3')`
    );
    const row = await db.query(`SELECT "orderId" FROM "PaymentException" WHERE id = 'pe3'`);
    expect(row.rows[0]).toEqual({ orderId: "ghost-order" });
  });
});
