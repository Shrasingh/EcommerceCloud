import { describe, expect, it, vi } from "vitest";

import { CHECKOUT_RATE_LIMIT, clientAddress, consume, windowStartFor } from "@/lib/rate-limit";

const rule = { limit: 3, windowMs: 60_000 };

/** A store whose upsert returns the given count. */
const storeReturning = (count: number) => ({ $queryRaw: vi.fn().mockResolvedValue([{ count }]) });

describe("windowStartFor", () => {
  it("floors to the start of the fixed window", () => {
    expect(windowStartFor(60_000 * 10 + 59_999, 60_000)).toEqual(new Date(60_000 * 10));
    expect(windowStartFor(60_000 * 11, 60_000)).toEqual(new Date(60_000 * 11));
  });
});

describe("consume", () => {
  it("allows requests up to the limit and reports the remaining budget", async () => {
    const decision = await consume(storeReturning(2), "k", rule, 60_000 * 10 + 1000);
    expect(decision).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 59 });
  });

  it("allows exactly the limit-th request and denies the next one", async () => {
    expect((await consume(storeReturning(3), "k", rule)).allowed).toBe(true);
    const denied = await consume(storeReturning(4), "k", rule, 60_000 * 10);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSeconds).toBe(60);
  });

  it("binds the key and the current window start into the upsert", async () => {
    const store = storeReturning(1);
    await consume(store, "checkout:s1:1.2.3.4", rule, 60_000 * 10 + 5);
    // Called as a tagged template: (strings, ...interpolated values).
    const [, ...values] = store.$queryRaw.mock.calls[0];
    expect(values).toContain("checkout:s1:1.2.3.4");
    expect(values).toContainEqual(new Date(60_000 * 10));
  });

  it("propagates store failures so the caller decides fail-open vs fail-closed", async () => {
    const store = { $queryRaw: vi.fn().mockRejectedValue(new Error("connection reset")) };
    await expect(consume(store, "k", rule)).rejects.toThrow("connection reset");
  });

  it("uses a conservative default for checkout", () => {
    expect(CHECKOUT_RATE_LIMIT.limit).toBeLessThanOrEqual(10);
    expect(CHECKOUT_RATE_LIMIT.windowMs).toBeGreaterThanOrEqual(60_000);
  });
});

describe("clientAddress", () => {
  it("takes the first x-forwarded-for entry (the connecting client on Vercel)", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then to a shared 'unknown' bucket", () => {
    expect(clientAddress(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});
