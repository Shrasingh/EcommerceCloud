import { describe, expect, it } from "vitest";

import {
  billboardSchema,
  checkoutSchema,
  colorSchema,
  productQuerySchema,
  productSchema,
  storeSchema,
} from "@/lib/validations";

const validProduct = {
  name: "Desk Lamp",
  price: 49.99,
  categoryId: "cat-1",
  sizeId: "size-1",
  colorId: "color-1",
  images: [{ url: "https://res.cloudinary.com/demo/lamp.jpg" }],
};

describe("storeSchema", () => {
  it("trims and accepts a name", () => {
    expect(storeSchema.parse({ name: "  My Store " })).toEqual({ name: "My Store" });
  });

  it("rejects blank and missing names with a readable message", () => {
    expect(storeSchema.safeParse({ name: "   " }).error?.issues[0].message).toBe("Name is required");
    expect(storeSchema.safeParse({}).error?.issues[0].message).toBe("Name is required");
  });
});

describe("productSchema", () => {
  it("accepts a valid product and defaults the flags", () => {
    const parsed = productSchema.parse(validProduct);
    expect(parsed.isFeatured).toBe(false);
    expect(parsed.isArchived).toBe(false);
  });

  it("coerces numeric strings for price", () => {
    expect(productSchema.parse({ ...validProduct, price: "12.5" }).price).toBe(12.5);
  });

  it.each([
    [{ price: 0 }, "Price must be greater than 0"],
    [{ price: "abc" }, "Price is required"],
    [{ images: [] }, "Images are required"],
    [{ images: "x" }, "Images are required"],
    [{ images: [{ url: "not-a-url" }] }, "Image URL must be a valid URL"],
    [{ categoryId: "" }, "Category id is required"],
  ])("rejects %o", (override, message) => {
    const result = productSchema.safeParse({ ...validProduct, ...override });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(message);
  });
});

describe("image URL host/scheme restriction", () => {
  it.each([
    "https://res.cloudinary.com/demo/x.jpg",
    "https://images.unsplash.com/photo-1",
    "https://plus.unsplash.com/photo-2",
    "https://picsum.photos/200",
  ])("accepts approved https host %s", (url) => {
    expect(billboardSchema.safeParse({ label: "Hero", imageUrl: url }).success).toBe(true);
  });

  it.each([
    ["http://res.cloudinary.com/x.jpg", "plain http on an approved host"],
    ["https://evil.example.com/x.jpg", "an unapproved host"],
    ["https://res.cloudinary.com.evil.com/x.jpg", "a look-alike host"],
  ])("rejects %s (%s)", (url) => {
    const result = billboardSchema.safeParse({ label: "Hero", imageUrl: url });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/approved host/);
  });

  it("applies the same restriction to product images", () => {
    const result = productSchema.safeParse({ ...validProduct, images: [{ url: "https://evil.example.com/x.jpg" }] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/approved host/);
  });
});

describe("colorSchema", () => {
  it.each(["#fff", "#A1B2C3", "#a1b2c3ff"])("accepts %s", (value) => {
    expect(colorSchema.safeParse({ name: "c", value }).success).toBe(true);
  });

  it.each(["red", "#ggg", "#12345", "fff"])("rejects %s", (value) => {
    expect(colorSchema.safeParse({ name: "c", value }).success).toBe(false);
  });
});

describe("checkoutSchema", () => {
  it("removes duplicate product ids", () => {
    expect(checkoutSchema.parse({ productIds: ["a", "b", "a"] }).productIds).toEqual(["a", "b"]);
  });

  it("rejects an empty or missing cart", () => {
    expect(checkoutSchema.safeParse({ productIds: [] }).success).toBe(false);
    expect(checkoutSchema.safeParse({}).success).toBe(false);
  });
});

describe("productQuerySchema", () => {
  it("treats empty strings as unset and coerces prices", () => {
    expect(productQuerySchema.parse({ colorId: "", minPrice: "10", maxPrice: "" })).toEqual({
      colorId: undefined,
      minPrice: 10,
      maxPrice: undefined,
    });
  });

  it("rejects non-numeric prices instead of querying with NaN", () => {
    expect(productQuerySchema.safeParse({ minPrice: "abc" }).success).toBe(false);
  });

  it("rejects an inverted price range", () => {
    const result = productQuerySchema.safeParse({ minPrice: "100", maxPrice: "50" });
    expect(result.error?.issues[0].message).toBe("minPrice cannot be greater than maxPrice");
  });
});
