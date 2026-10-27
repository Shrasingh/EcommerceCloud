import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { ApiError, assertFound, handleApiError, parseBody, requireStoreOwner } from "@/lib/api";
import { sizeSchema } from "@/lib/validations";

type Params = { params: Promise<{ storeId: string; sizeId: string }> };

export async function GET(_req: Request, props: Params) {
  try {
    const { storeId, sizeId } = await props.params;
    const size = await prismadb.size.findFirst({ where: { id: sizeId, storeId } });
    if (!size) throw new ApiError(404, "Size not found");
    return NextResponse.json(size);
  } catch (error) {
    return handleApiError("SIZE_GET", error);
  }
}

export async function PATCH(req: Request, props: Params) {
  try {
    const { storeId, sizeId } = await props.params;
    await requireStoreOwner(storeId);
    const { name, value } = await parseBody(req, sizeSchema);

    const result = await prismadb.size.updateMany({
      where: { id: sizeId, storeId },
      data: { name, value },
    });
    return NextResponse.json(assertFound(result, "Size"));
  } catch (error) {
    return handleApiError("SIZE_PATCH", error);
  }
}

export async function DELETE(_req: Request, props: Params) {
  try {
    const { storeId, sizeId } = await props.params;
    await requireStoreOwner(storeId);

    const result = await prismadb.size.deleteMany({ where: { id: sizeId, storeId } });
    return NextResponse.json(assertFound(result, "Size"));
  } catch (error) {
    return handleApiError("SIZE_DELETE", error, {
      conflictMessage: "This size is used by one or more products. Update them first.",
    });
  }
}
