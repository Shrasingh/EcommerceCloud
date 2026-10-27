import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import {
  ApiError,
  assertFound,
  assertRefsInStore,
  handleApiError,
  parseBody,
  requireStoreOwner,
} from "@/lib/api";
import { productSchema } from "@/lib/validations";

type Params = { params: Promise<{ storeId: string; productId: string }> };

export async function GET(_req: Request, props: Params) {
  try {
    const { storeId, productId } = await props.params;
    const product = await prismadb.product.findFirst({
      where: { id: productId, storeId },
      include: { images: true, category: true, size: true, color: true },
    });
    if (!product) throw new ApiError(404, "Product not found");
    return NextResponse.json(product);
  } catch (error) {
    return handleApiError("PRODUCT_GET", error);
  }
}

export async function PATCH(req: Request, props: Params) {
  try {
    const { storeId, productId } = await props.params;
    await requireStoreOwner(storeId);
    const { images, ...data } = await parseBody(req, productSchema);
    await assertRefsInStore(storeId, {
      categoryId: data.categoryId,
      sizeId: data.sizeId,
      colorId: data.colorId,
    });

    const existing = await prismadb.product.findFirst({
      where: { id: productId, storeId },
      select: { id: true },
    });
    if (!existing) throw new ApiError(404, "Product not found");

    // Nested writes run in one transaction, so a failure can't leave the
    // product without images.
    const product = await prismadb.product.update({
      where: { id: productId },
      data: {
        ...data,
        images: { deleteMany: {}, createMany: { data: images } },
      },
    });
    return NextResponse.json(product);
  } catch (error) {
    return handleApiError("PRODUCT_PATCH", error);
  }
}

export async function DELETE(_req: Request, props: Params) {
  try {
    const { storeId, productId } = await props.params;
    await requireStoreOwner(storeId);

    const result = await prismadb.product.deleteMany({
      where: { id: productId, storeId },
    });
    return NextResponse.json(assertFound(result, "Product"));
  } catch (error) {
    return handleApiError("PRODUCT_DELETE", error, {
      conflictMessage:
        "This product appears in existing orders and cannot be deleted. Mark it as Archived instead to hide it from the store.",
    });
  }
}
