// Cross-store authorization for every catalog write route, plus the sizes and
// colors routes that had no coverage. The Prisma client is mocked; ownership
// is decided by the same `store.findFirst({ where: { id, userId } })` query
// the real helper issues, answered only for user_1 + s1.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prismaMock, resetPrismaMock } from "../helpers/prisma-mock";
import { ctx, jsonRequest } from "../helpers/http";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/prismadb", async () => ({ default: (await import("../helpers/prisma-mock")).prismaMock }));

import * as billboards from "@/app/api/[storeId]/billboards/route";
import * as billboard from "@/app/api/[storeId]/billboards/[billboardId]/route";
import * as categories from "@/app/api/[storeId]/categories/route";
import * as category from "@/app/api/[storeId]/categories/[categoryId]/route";
import * as sizes from "@/app/api/[storeId]/sizes/route";
import * as size from "@/app/api/[storeId]/sizes/[sizeId]/route";
import * as colors from "@/app/api/[storeId]/colors/route";
import * as color from "@/app/api/[storeId]/colors/[colorId]/route";
import * as products from "@/app/api/[storeId]/products/route";
import * as product from "@/app/api/[storeId]/products/[productId]/route";

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

const image = "https://res.cloudinary.com/demo/x.jpg";
const productBody = {
  name: "Lamp",
  price: 20,
  categoryId: "c1",
  sizeId: "z1",
  colorId: "k1",
  images: [{ url: image }],
};

// Route handlers declare their own narrow `params` shape; the table below calls them
// through a loose signature, which is exactly what Next.js does at runtime.
type Handler = (req: Request, ctx: any) => Promise<Response>;
type AnyHandler = (...args: never[]) => Promise<Response>;

/** Every write handler, the body it accepts, and the Prisma model it would write. */
const writes: [string, AnyHandler, string, unknown, string][] = [
  ["billboards POST", billboards.POST, "billboards", { label: "Sale", imageUrl: image }, "billboard"],
  ["billboards/[id] PATCH", billboard.PATCH, "billboards/b1", { label: "Sale", imageUrl: image }, "billboard"],
  ["billboards/[id] DELETE", billboard.DELETE, "billboards/b1", undefined, "billboard"],
  ["categories POST", categories.POST, "categories", { name: "Shoes", billboardId: "b1" }, "category"],
  ["categories/[id] PATCH", category.PATCH, "categories/c1", { name: "Shoes", billboardId: "b1" }, "category"],
  ["categories/[id] DELETE", category.DELETE, "categories/c1", undefined, "category"],
  ["sizes POST", sizes.POST, "sizes", { name: "Large", value: "L" }, "size"],
  ["sizes/[id] PATCH", size.PATCH, "sizes/z1", { name: "Large", value: "L" }, "size"],
  ["sizes/[id] DELETE", size.DELETE, "sizes/z1", undefined, "size"],
  ["colors POST", colors.POST, "colors", { name: "Red", value: "#ff0000" }, "color"],
  ["colors/[id] PATCH", color.PATCH, "colors/k1", { name: "Red", value: "#ff0000" }, "color"],
  ["colors/[id] DELETE", color.DELETE, "colors/k1", undefined, "color"],
  ["products POST", products.POST, "products", productBody, "product"],
  ["products/[id] PATCH", product.PATCH, "products/p1", productBody, "product"],
  ["products/[id] DELETE", product.DELETE, "products/p1", undefined, "product"],
];

const idParam = (path: string) => {
  const [resource, id] = path.split("/");
  const key = { billboards: "billboardId", categories: "categoryId", sizes: "sizeId", colors: "colorId", products: "productId" }[
    resource
  ]!;
  return id ? { [key]: id } : {};
};

const writeMethods = ["create", "update", "updateMany", "delete", "deleteMany"] as const;
const noWrites = (model: string) => {
  for (const method of writeMethods) expect(prismaMock[model][method]).not.toHaveBeenCalled();
};

describe("every catalog write route", () => {
  describe.each(writes)("%s", (_label, handler, path, body, model) => {
    const method = _label.split(" ")[1];

    it("returns 401 when signed out and writes nothing", async () => {
      authMock.mockResolvedValue({ userId: null });
      const res = await (handler as Handler)(jsonRequest(`/api/s1/${path}`, method, body), ctx({ storeId: "s1", ...idParam(path) }));
      expect(res.status).toBe(401);
      noWrites(model);
    });

    it("returns 403 for a store owned by someone else and writes nothing", async () => {
      signInAsOwner();
      const res = await (handler as Handler)(jsonRequest(`/api/s2/${path}`, method, body), ctx({ storeId: "s2", ...idParam(path) }));
      expect(res.status).toBe(403);
      expect(await res.text()).toBe("Unauthorized");
      noWrites(model);
    });
  });
});

describe("sizes and colors routes (owner of s1)", () => {
  beforeEach(signInAsOwner);

  it("creates a size scoped to the store", async () => {
    prismaMock.size.create.mockResolvedValue({ id: "z1" });
    const res = await sizes.POST(jsonRequest("/api/s1/sizes", "POST", { name: "Large", value: "L" }), ctx({ storeId: "s1" }));
    expect(res.status).toBe(200);
    expect(prismaMock.size.create).toHaveBeenCalledWith({ data: { name: "Large", value: "L", storeId: "s1" } });
  });

  it("rejects a non-hex color value with a readable 400", async () => {
    const res = await colors.POST(jsonRequest("/api/s1/colors", "POST", { name: "Red", value: "red" }), ctx({ storeId: "s1" }));
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/hex color/);
    expect(prismaMock.color.create).not.toHaveBeenCalled();
  });

  it.each([
    ["size", size.PATCH, { name: "Large", value: "L" }],
    ["color", color.PATCH, { name: "Red", value: "#ff0000" }],
  ] as const)("%s PATCH is scoped by storeId and 404s for a record in another store", async (model, handler, body) => {
    prismaMock[model].updateMany.mockResolvedValue({ count: 0 });
    const res = await handler(jsonRequest(`/api/s1/${model}s/x-other`, "PATCH", body), ctx({ storeId: "s1", [`${model}Id`]: "x-other" }) as never);
    expect(res.status).toBe(404);
    expect(prismaMock[model].updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "x-other", storeId: "s1" } }));
  });

  it.each([
    ["size", size.DELETE],
    ["color", color.DELETE],
  ] as const)("%s DELETE is scoped by storeId and 404s for a record in another store", async (model, handler) => {
    prismaMock[model].deleteMany.mockResolvedValue({ count: 0 });
    const res = await handler(jsonRequest(`/api/s1/${model}s/x-other`, "DELETE"), ctx({ storeId: "s1", [`${model}Id`]: "x-other" }) as never);
    expect(res.status).toBe(404);
    expect(prismaMock[model].deleteMany).toHaveBeenCalledWith({ where: { id: "x-other", storeId: "s1" } });
  });

  it.each([
    ["sizes", sizes.GET, "size"],
    ["colors", colors.GET, "color"],
  ] as const)("public %s GET only lists the requested store", async (path, handler, model) => {
    prismaMock[model].findMany.mockResolvedValue([]);
    const res = await handler(jsonRequest(`/api/s1/${path}`, "GET"), ctx({ storeId: "s1" }));
    expect(res.status).toBe(200);
    expect(prismaMock[model].findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "s1" } }));
  });

  it.each([
    ["size", size.GET],
    ["color", color.GET],
  ] as const)("public %s GET by id is scoped by storeId", async (model, handler) => {
    prismaMock[model].findFirst.mockResolvedValue(null);
    const res = await handler(jsonRequest(`/api/s1/${model}s/x-other`, "GET"), ctx({ storeId: "s1", [`${model}Id`]: "x-other" }) as never);
    expect(res.status).toBe(404);
    expect(prismaMock[model].findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "x-other", storeId: "s1" } }));
  });
});
