import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import {
  assertRefsInStore,
  handleApiError,
  parseBody,
  requireStoreOwner,
  validate,
} from "@/lib/api";
import { buildProductWhere } from "@/lib/products";
import { productQuerySchema, productSchema } from "@/lib/validations";

type Params = { params: Promise<{ storeId: string }> };

export async function POST(req: Request, props: Params) {
  try {
    const { storeId } = await props.params;
    await requireStoreOwner(storeId);
    const { images, ...data } = await parseBody(req, productSchema);
    await assertRefsInStore(storeId, {
      categoryId: data.categoryId,
      sizeId: data.sizeId,
      colorId: data.colorId,
    });

    const product = await prismadb.product.create({
      data: {
        ...data,
        storeId,
        images: { createMany: { data: images } },
      },
    });
    return NextResponse.json(product);
  } catch (error) {
    return handleApiError("PRODUCTS_POST", error);
  }
}

export async function GET(req: Request, props: Params) {
  try {
    const { storeId } = await props.params;
    const { searchParams } = new URL(req.url);
    const query = validate(Object.fromEntries(searchParams), productQuerySchema);

    const products = await prismadb.product.findMany({
      where: buildProductWhere(storeId, query),
      include: { images: true, category: true, color: true, size: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(products);
  } catch (error) {
    return handleApiError("PRODUCTS_GET", error);
  }
}
