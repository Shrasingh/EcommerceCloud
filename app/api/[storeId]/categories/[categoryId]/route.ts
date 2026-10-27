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
import { categorySchema } from "@/lib/validations";

type Params = { params: Promise<{ storeId: string; categoryId: string }> };

export async function GET(_req: Request, props: Params) {
  try {
    const { storeId, categoryId } = await props.params;
    const category = await prismadb.category.findFirst({
      where: { id: categoryId, storeId },
      include: { billboard: true },
    });
    if (!category) throw new ApiError(404, "Category not found");
    return NextResponse.json(category);
  } catch (error) {
    return handleApiError("CATEGORY_GET", error);
  }
}

export async function PATCH(req: Request, props: Params) {
  try {
    const { storeId, categoryId } = await props.params;
    await requireStoreOwner(storeId);
    const { name, billboardId } = await parseBody(req, categorySchema);
    await assertRefsInStore(storeId, { billboardId });

    const result = await prismadb.category.updateMany({
      where: { id: categoryId, storeId },
      data: { name, billboardId },
    });
    return NextResponse.json(assertFound(result, "Category"));
  } catch (error) {
    return handleApiError("CATEGORY_PATCH", error);
  }
}

export async function DELETE(_req: Request, props: Params) {
  try {
    const { storeId, categoryId } = await props.params;
    await requireStoreOwner(storeId);

    const result = await prismadb.category.deleteMany({
      where: { id: categoryId, storeId },
    });
    return NextResponse.json(assertFound(result, "Category"));
  } catch (error) {
    return handleApiError("CATEGORY_DELETE", error, {
      conflictMessage: "This category still has products. Move or delete them first.",
    });
  }
}
