import { describe, expect, it } from "vitest";

import { checkSeedAllowed, databaseHostFrom, WIPE_FLAG } from "@/prisma/seed-guard";

const host = "ep-mute-bar.us-east-1.aws.neon.tech";

describe("checkSeedAllowed", () => {
  it("allows seeding an empty database", () => {
    expect(checkSeedAllowed({ existingStores: 0, databaseHost: host, env: {} })).toEqual({ allowed: true });
  });

  it("refuses a non-empty database without confirmation, and says so", () => {
    const result = checkSeedAllowed({ existingStores: 4, databaseHost: host, env: {} });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("4 store(s)");
      expect(result.reason).toContain(`${WIPE_FLAG}=${host}`);
    }
  });

  it("refuses when the confirmation names a different database", () => {
    const env = { [WIPE_FLAG]: "some-other-host.neon.tech" };
    expect(checkSeedAllowed({ existingStores: 4, databaseHost: host, env }).allowed).toBe(false);
  });

  it("refuses a truthy-but-generic confirmation like 'true'", () => {
    expect(checkSeedAllowed({ existingStores: 1, databaseHost: host, env: { [WIPE_FLAG]: "true" } }).allowed).toBe(false);
  });

  it("allows a non-empty database only when the exact host is confirmed", () => {
    expect(checkSeedAllowed({ existingStores: 4, databaseHost: host, env: { [WIPE_FLAG]: host } })).toEqual({
      allowed: true,
    });
  });

  it("always refuses on Vercel or in production, even with confirmation", () => {
    for (const env of [{ VERCEL: "1" }, { NODE_ENV: "production" }]) {
      expect(checkSeedAllowed({ existingStores: 0, databaseHost: host, env: { ...env, [WIPE_FLAG]: host } }).allowed).toBe(false);
    }
  });

  it("refuses when the host can't be determined and data exists", () => {
    // databaseHost "" never matches a real confirmation value
    expect(checkSeedAllowed({ existingStores: 2, databaseHost: "", env: { [WIPE_FLAG]: host } }).allowed).toBe(false);
  });
});

describe("databaseHostFrom", () => {
  it("extracts the host from a Postgres URL", () => {
    expect(databaseHostFrom(`postgresql://u:p@${host}/neondb?sslmode=require`)).toBe(host);
  });

  it("returns an empty string for missing or invalid URLs", () => {
    expect(databaseHostFrom(undefined)).toBe("");
    expect(databaseHostFrom("not a url")).toBe("");
  });
});
