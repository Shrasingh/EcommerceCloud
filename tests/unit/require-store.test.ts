import { beforeEach, describe, expect, it, vi } from "vitest";

import { prismaMock, resetPrismaMock } from "../helpers/prisma-mock";

const authMock = vi.hoisted(() => vi.fn());

// `redirect` throws in Next.js to abort rendering; model that here so we can
// both assert the destination and confirm execution stops at the redirect.
const redirectMock = vi.hoisted(() => vi.fn((to: string) => {
  throw new (class extends Error {
    to = to;
    constructor() {
      super(`REDIRECT:${to}`);
    }
  })();
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/prismadb", async () => ({ default: (await import("../helpers/prisma-mock")).prismaMock }));

import { requireStoreAccess } from "@/lib/require-store";

beforeEach(() => {
  resetPrismaMock();
  authMock.mockReset();
  redirectMock.mockClear();
});

describe("requireStoreAccess", () => {
  it("lets the owner through and returns the store, scoping the query to their userId", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.store.findFirst.mockResolvedValue({ id: "store_owned" });

    const store = await requireStoreAccess("store_owned");

    expect(store).toEqual({ id: "store_owned" });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(prismaMock.store.findFirst).toHaveBeenCalledWith({
      where: { id: "store_owned", userId: "user_1" },
      select: { id: true },
    });
  });

  it("redirects a non-owner away without returning another store's data", async () => {
    authMock.mockResolvedValue({ userId: "user_2" });
    // The store exists, but not for this user, so the owner-scoped query misses.
    prismaMock.store.findFirst.mockResolvedValue(null);

    await expect(requireStoreAccess("store_of_someone_else")).rejects.toMatchObject({
      to: "/",
    });
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("redirects a signed-out user to sign-in and never queries store data", async () => {
    authMock.mockResolvedValue({ userId: null });

    await expect(requireStoreAccess("any_store")).rejects.toMatchObject({
      to: "/sign-in",
    });
    expect(redirectMock).toHaveBeenCalledWith("/sign-in");
    expect(prismaMock.store.findFirst).not.toHaveBeenCalled();
  });
});
