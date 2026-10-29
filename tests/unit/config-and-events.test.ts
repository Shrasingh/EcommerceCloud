import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { ConfigError, getCheckoutConfig, resolveStorefront } from "@/lib/config";
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

describe("getCheckoutConfig: ALLOWED_STOREFRONT_ORIGINS", () => {
  const ok = { STRIPE_API_KEY: "sk_test_x", FRONTEND_STORE_URL: "https://shop.example.com/store" };

  it("always allows the configured storefront's own origin", () => {
    expect(getCheckoutConfig(ok).allowedOrigins).toEqual(["https://shop.example.com"]);
  });

  it("adds extra origins, normalised and de-duplicated", () => {
    const config = getCheckoutConfig({
      ...ok,
      ALLOWED_STOREFRONT_ORIGINS: " https://preview.example.com/ , https://shop.example.com, http://localhost:3001 ,,",
    });
    expect(config.allowedOrigins).toEqual(["https://shop.example.com", "https://preview.example.com", "http://localhost:3001"]);
  });

  it.each([
    "shop.example.com",
    "http://preview.example.com",
    "https://preview.example.com/path",
    "https://preview.example.com/?x=1",
    "https://u:p@preview.example.com",
    "javascript:alert(1)",
  ])("rejects the whole list when an entry is not a bare https origin: %s", (entry) => {
    expect(() => getCheckoutConfig({ ...ok, ALLOWED_STOREFRONT_ORIGINS: `https://ok.example.com,${entry}` })).toThrow(
      ConfigError
    );
    try {
      getCheckoutConfig({ ...ok, ALLOWED_STOREFRONT_ORIGINS: entry });
    } catch (error) {
      expect((error as ConfigError).variables).toEqual(["ALLOWED_STOREFRONT_ORIGINS"]);
    }
  });
});

describe("resolveStorefront", () => {
  const config = getCheckoutConfig({
    STRIPE_API_KEY: "sk_test_x",
    FRONTEND_STORE_URL: "https://shop.example.com/store",
    ALLOWED_STOREFRONT_ORIGINS: "https://preview.example.com",
  });

  it("uses the configured storefront (path included) when there is no Origin header", () => {
    expect(resolveStorefront(config, null)).toEqual({ ok: true, baseUrl: "https://shop.example.com/store", origin: null });
  });

  it("uses the configured storefront when the Origin is its own origin", () => {
    expect(resolveStorefront(config, "https://shop.example.com")).toEqual({
      ok: true,
      baseUrl: "https://shop.example.com/store",
      origin: "https://shop.example.com",
    });
  });

  it("redirects an allow-listed Preview origin back to itself, never to production", () => {
    expect(resolveStorefront(config, "https://preview.example.com")).toEqual({
      ok: true,
      baseUrl: "https://preview.example.com",
      origin: "https://preview.example.com",
    });
  });

  it.each([
    "https://evil.example.com",
    "https://shop.example.com.evil.net",
    "http://shop.example.com",
    "null",
    "https://shop.example.com:8443",
    "not a url",
  ])("refuses an origin that is not on the allow list: %s", (origin) => {
    expect(resolveStorefront(config, origin)).toEqual({ ok: false, reason: "origin_not_allowed", origin });
  });
});
