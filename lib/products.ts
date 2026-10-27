import type { Prisma } from "@prisma/client";

import type { ProductQuery } from "@/lib/validations";

/**
 * Builds the Prisma filter for the public product listing.
 * Archived products (sold or hidden by the admin) are never returned.
 */
export function buildProductWhere(storeId: string, query: ProductQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    storeId,
    isArchived: false,
    categoryId: query.categoryId,
    colorId: query.colorId,
    sizeId: query.sizeId,
  };

  if (query.isFeatured === "true") where.isFeatured = true;

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.price = { gte: query.minPrice, lte: query.maxPrice };
  }

  if (query.search) {
    // Case-insensitive match on name, brand, description or category name.
    const contains = { contains: query.search, mode: "insensitive" as const };
    where.OR = [
      { name: contains },
      { brand: contains },
      { description: contains },
      { category: { name: contains } },
    ];
  }

  return where;
}
