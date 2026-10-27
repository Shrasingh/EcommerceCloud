import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { ConfigError, getCheckoutConfig } from "@/lib/config";
import { classifyCheckoutEvent } from "@/lib/stripe-events";

describe("getCheckoutConfig", () => {
  const ok = { STRIPE_API_KEY: "sk_test_x", FRONTEND_STORE_URL: "https://shop.example.com" };

  it("returns the storefront URL without a trailing slash", () => {
    expect(getCheckoutConfig({ ...ok, FRONTEND_STORE_URL: "https://shop.example.com/" }).storefrontUrl).toBe(
      "https://shop.example.com"
    );
    expect(getCheckoutConfig({ ...ok, FRONTEND_STORE_URL: " https://shop.example.com/store// " }).storefrontUrl).toBe(
      "https://shop.example.com/store"
    );
  });

  it.each(["http://localhost:3001", "http://127.0.0.1:3001"])("accepts local http %s", (url) => {
    expect(getCheckoutConfig({ ...ok, FRONTEND_STORE_URL: url }).storefrontUrl).toBe(url);
  });

  it.each([
    undefined,
    "",
    "shop.example.com",
    "javascript:alert(1)",
    "ftp://shop.example.com",
    "http://shop.example.com",
    "https://u:p@shop.example.com",
    "https://shop.example.com/?next=evil",
    "https://shop.example.com/#frag",
  ])("rejects FRONTEND_STORE_URL=%s", (url) => {
    expect(() => getCheckoutConfig({ ...ok, FRONTEND_STORE_URL: url })).toThrow(ConfigError);
  });

  it("reports every invalid variable by name, never by value", () => {
    try {
      getCheckoutConfig({ FRONTEND_STORE_URL: "https://u:supersecret@x.com" });
      throw new Error("expected ConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).variables).toEqual(["STRIPE_API_KEY", "FRONTEND_STORE_URL"]);
      expect((error as Error).message).not.toContain("supersecret");
    }
  });
});

describe("classifyCheckoutEvent", () => {
  const event = (type: string, session: Partial<Stripe.Checkout.Session>) =>
    ({ type, data: { object: session } }) as unknown as Stripe.Event;
  const meta = { metadata: { orderId: "o1" } };

  it("fulfils completed sessions that are paid", () => {
    expect(classifyCheckoutEvent(event("checkout.session.completed", { ...meta, payment_status: "paid" }))).toMatchObject({
      action: "fulfill",
      orderId: "o1",
    });
  });

  it("waits on completed sessions that are still unpaid (delayed methods)", () => {
    expect(classifyCheckoutEvent(event("checkout.session.completed", { ...meta, payment_status: "unpaid" })).action).toBe(
      "ignore"
    );
  });

  it("fulfils async_payment_succeeded only when the session is paid", () => {
    expect(
      classifyCheckoutEvent(event("checkout.session.async_payment_succeeded", { ...meta, payment_status: "paid" })).action
    ).toBe("fulfill");
    expect(
      classifyCheckoutEvent(event("checkout.session.async_payment_succeeded", { ...meta, payment_status: "unpaid" })).action
    ).toBe("ignore");
  });

  it("reports async payment failures", () => {
    expect(classifyCheckoutEvent(event("checkout.session.async_payment_failed", { ...meta, payment_status: "unpaid" }))).toEqual({
      action: "payment_failed",
      orderId: "o1",
    });
  });

  it("ignores unrelated events and sessions without an orderId", () => {
    expect(classifyCheckoutEvent(event("invoice.paid", { ...meta, payment_status: "paid" })).action).toBe("ignore");
    expect(classifyCheckoutEvent(event("checkout.session.completed", { payment_status: "paid" })).action).toBe("ignore");
  });
});
