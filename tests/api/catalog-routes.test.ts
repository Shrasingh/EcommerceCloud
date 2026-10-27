import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import { prismaMock, resetPrismaMock } from "../helpers/prisma-mock";
import { ctx, jsonRequest } from "../helpers/http";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/prismadb", async () => ({ default: (await import("../helpers/prisma-mock")).prismaMock }));

import * as billboards from "@/app/api/[storeId]/billboards/route";
import * as billboard from "@/app/api/[storeId]/billboards/[billboardId]/route";
import * as categories from "@/app/api/[storeId]/categories/route";
import * as products from "@/app/api/[storeId]/products/route";
import * as product from "@/app/api/[storeId]/products/[productId]/route";
import * as stores from "@/app/api/stores/[storeId]/route";

const fkError = () =>
  new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", {
    code: "P2003",
    clientVersion: "test",
  });

/** Signed in as `user_1`, who owns store `s1` only. */
function signInAsOwner() {
  authMock.mockResolvedValue({ userId: "user_1" });
  prismaMock.store.findFirst.mockImplementation(async ({ where }: { where: { id: string; userId: string } }) =>
    where.id === "s1" && where.userId === "user_1" ? { id: "s1" } : null
  );
}

beforeEach(() => {
  resetPrismaMock();
  authMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("authorization on write routes", () => {
  const body = { label: "Sale", imageUrl: "https://res.cloudinary.com/x.jpg" };

  it("returns 401 when signed out", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await billboards.POST(jsonRequest("/api/s1/billboards", "POST", body), ctx({ storeId: "s1" }));
    expect(res.status).toBe(401);
    expect(prismaMock.billboard.create).not.toHaveBeenCalled();
  });

  it("returns 403 for a store owned by someone else", async () => {
    signInAsOwner();
    const res = await billboards.POST(jsonRequest("/api/s2/billboards", "POST", body), ctx({ storeId: "s2" }));
    expect(res.status).toBe(403);
    expect(prismaMock.billboard.create).not.toHaveBeenCalled();
  });

  it("creates the billboard for the owner", async () => {
    signInAsOwner();
    prismaMock.billboard.create.mockResolvedValue({ id: "b1", ...body, storeId: "s1" });
    const res = await billboards.POST(jsonRequest("/api/s1/billboards", "POST", body), ctx({ storeId: "s1" }));
    expect(res.status).toBe(200);
    expect(prismaMock.billboard.create).toHaveBeenCalledWith({ data: { ...body, storeId: "s1" } });
  });
});

describe("input validation", () => {
  it("returns 400 with the validation message for a bad body", async () => {
    signInAsOwner();
    const res = await billboards.POST(
      jsonRequest("/api/s1/billboards", "POST", { label: "Sale", imageUrl: "not a url" }),
      ctx({ storeId: "s1" })
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Image URL must be a valid URL");
  });

  it("returns 400 for malformed JSON", async () => {
    signInAsOwner();
    const res = await billboards.POST(jsonRequest("/api/s1/billboards", "POST", "{oops"), ctx({ storeId: "s1" }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Request body must be valid JSON");
  });

  it("returns 400 for non-numeric price filters on the public product list", async () => {
    const res = await products.GET(jsonRequest("/api/s1/products?minPrice=abc", "GET"), ctx({ storeId: "s1" }));
    expect(res.status).toBe(400);
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });
});

describe("tenant isolation", () => {
  it("scopes updates to the store and returns 404 when the record is in another store", async () => {
    signInAsOwner();
    prismaMock.billboard.updateMany.mockResolvedValue({ count: 0 });
    const res = await billboard.PATCH(
      jsonRequest("/api/s1/billboards/b-other", "PATCH", { label: "x", imageUrl: "https://res.cloudinary.com/x.jpg" }),
      ctx({ storeId: "s1", billboardId: "b-other" })
    );
    expect(prismaMock.billboard.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "b-other", storeId: "s1" } })
    );
    expect(res.status).toBe(404);
  });

  it("rejects a category that points at another store's billboard", async () => {
    signInAsOwner();
    prismaMock.billboard.count.mockResolvedValue(0);
    const res = await categories.POST(
      jsonRequest("/api/s1/categories", "POST", { name: "Shoes", billboardId: "b-from-s2" }),
      ctx({ storeId: "s1" })
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Billboard not found in this store");
    expect(prismaMock.category.create).not.toHaveBeenCalled();
  });

  it("public GET only returns records of the requested store", async () => {
    prismaMock.product.findFirst.mockResolvedValue(null);
    const res = await product.GET(jsonRequest("/api/s1/products/p9", "GET"), ctx({ storeId: "s1", productId: "p9" }));
    expect(prismaMock.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p9", storeId: "s1" } })
    );
    expect(res.status).toBe(404);
  });
});

describe("conflicts", () => {
  it("returns 409 with guidance when a product with orders is deleted", async () => {
    signInAsOwner();
    prismaMock.product.deleteMany.mockRejectedValue(fkError());
    const res = await product.DELETE(jsonRequest("/api/s1/products/p1", "DELETE"), ctx({ storeId: "s1", productId: "p1" }));
    expect(res.status).toBe(409);
    expect(await res.text()).toMatch(/Archived/);
  });

  it("returns 409 when deleting a store that still has data", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.store.deleteMany.mockRejectedValue(fkError());
    const res = await stores.DELETE(jsonRequest("/api/stores/s1", "DELETE"), ctx({ storeId: "s1" }));
    expect(res.status).toBe(409);
  });

  it("returns 500 without leaking details for unexpected errors", async () => {
    prismaMock.billboard.findMany.mockRejectedValue(new Error("connection reset"));
    const res = await billboards.GET(jsonRequest("/api/s1/billboards", "GET"), ctx({ storeId: "s1" }));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Internal error");
  });
});

describe("product writes", () => {
  const body = {
    name: "Lamp",
    price: 20,
    categoryId: "c1",
    sizeId: "z1",
    colorId: "k1",
    images: [{ url: "https://res.cloudinary.com/1.jpg" }],
  };

  it("replaces images in a single update after checking ownership of the product", async () => {
    signInAsOwner();
    prismaMock.category.count.mockResolvedValue(1);
    prismaMock.size.count.mockResolvedValue(1);
    prismaMock.color.count.mockResolvedValue(1);
    prismaMock.product.findFirst.mockResolvedValue({ id: "p1" });
    prismaMock.product.update.mockResolvedValue({ id: "p1" });

    const res = await product.PATCH(jsonRequest("/api/s1/products/p1", "PATCH", body), ctx({ storeId: "s1", productId: "p1" }));

    expect(res.status).toBe(200);
    expect(prismaMock.product.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.product.update.mock.calls[0][0].data.images).toEqual({
      deleteMany: {},
      createMany: { data: body.images },
    });
  });

  it("returns 404 when patching a product from another store", async () => {
    signInAsOwner();
    prismaMock.category.count.mockResolvedValue(1);
    prismaMock.size.count.mockResolvedValue(1);
    prismaMock.color.count.mockResolvedValue(1);
    prismaMock.product.findFirst.mockResolvedValue(null);

    const res = await product.PATCH(jsonRequest("/api/s1/products/p2", "PATCH", body), ctx({ storeId: "s1", productId: "p2" }));
    expect(res.status).toBe(404);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });
});
