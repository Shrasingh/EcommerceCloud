import { z } from "zod";

// Request schemas shared by the API routes (and reusable by forms).
// Messages are returned verbatim to the client as the 400 response body.

const requiredString = (label: string, max = 200) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

const id = (label: string) => requiredString(label, 100);

// Image hosts the app is allowed to load, kept in sync with the
// `images.remotePatterns` list in next.config.mjs. next/image refuses to
// render any other host, so an unlisted URL would only produce a broken
// image; rejecting it at validation also blocks pointing records at
// arbitrary external URLs. All entries are https-only.
export const ALLOWED_IMAGE_HOSTS = [
  "res.cloudinary.com",
  "images.unsplash.com",
  "plus.unsplash.com",
  "picsum.photos",
];

function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

const imageUrl = z
  .url({ error: "Image URL must be a valid URL" })
  .refine(isAllowedImageUrl, {
    message: `Image URL must use https and an approved host (${ALLOWED_IMAGE_HOSTS.join(", ")})`,
  });

export const storeSchema = z.object({
  name: requiredString("Name", 100),
});

export const billboardSchema = z.object({
  label: requiredString("Label"),
  imageUrl,
});

export const categorySchema = z.object({
  name: requiredString("Name", 100),
  billboardId: id("Billboard id"),
});

export const sizeSchema = z.object({
  name: requiredString("Name", 100),
  value: requiredString("Value", 50),
});

export const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export const colorSchema = z.object({
  name: requiredString("Name", 100),
  value: z
    .string({ error: "Value is required" })
    .trim()
    .regex(HEX_COLOR, "Value must be a hex color code, e.g. #ff0000"),
});

export const productSchema = z.object({
  name: requiredString("Name"),
  price: z.coerce
    .number<number>({ error: "Price is required" })
    .positive("Price must be greater than 0")
    .max(1_000_000, "Price is too large"),
  categoryId: id("Category id"),
  sizeId: id("Size id"),
  colorId: id("Color id"),
  images: z
    .array(z.object({ url: imageUrl }), {
      error: "Images are required",
    })
    .min(1, "Images are required")
    .max(10, "At most 10 images are allowed"),
  isFeatured: z.boolean().optional().default(false),
  isArchived: z.boolean().optional().default(false),
});

export const checkoutSchema = z.object({
  productIds: z
    .array(z.string().min(1), { error: "Product Ids not found" })
    .min(1, "Product Ids not found")
    .max(50, "Too many products in one checkout")
    // The cart holds each product once; drop duplicates defensively.
    .transform((ids) => [...new Set(ids)]),
});

// Query-string params arrive as strings; empty strings mean "not set".
const optionalParam = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.string().trim().max(100).optional()
);
const optionalPrice = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.coerce.number({ error: "Price filters must be numbers" }).nonnegative().optional()
);

export const productQuerySchema = z
  .object({
    categoryId: optionalParam,
    colorId: optionalParam,
    sizeId: optionalParam,
    isFeatured: optionalParam,
    search: optionalParam,
    minPrice: optionalPrice,
    maxPrice: optionalPrice,
  })
  .refine(
    (q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice,
    { message: "minPrice cannot be greater than maxPrice" }
  );

export type ProductInput = z.infer<typeof productSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;
