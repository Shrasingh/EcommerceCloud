import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { ApiError, assertFound, handleApiError, parseBody, requireStoreOwner } from "@/lib/api";
import { colorSchema } from "@/lib/validations";

type Params = { params: Promise<{ storeId: string; colorId: string }> };

export async function GET(_req: Request, props: Params) {
  try {
    const { storeId, colorId } = await props.params;
    const color = await prismadb.color.findFirst({ where: { id: colorId, storeId } });
    if (!color) throw new ApiError(404, "Color not found");
    return NextResponse.json(color);
  } catch (error) {
    return handleApiError("COLOR_GET", error);
  }
}

export async function PATCH(req: Request, props: Params) {
  try {
    const { storeId, colorId } = await props.params;
    await requireStoreOwner(storeId);
    const { name, value } = await parseBody(req, colorSchema);

    const result = await prismadb.color.updateMany({
      where: { id: colorId, storeId },
      data: { name, value },
    });
    return NextResponse.json(assertFound(result, "Color"));
  } catch (error) {
    return handleApiError("COLOR_PATCH", error);
  }
}

export async function DELETE(_req: Request, props: Params) {
  try {
    const { storeId, colorId } = await props.params;
    await requireStoreOwner(storeId);

    const result = await prismadb.color.deleteMany({ where: { id: colorId, storeId } });
    return NextResponse.json(assertFound(result, "Color"));
  } catch (error) {
    return handleApiError("COLOR_DELETE", error, {
      conflictMessage: "This color is used by one or more products. Update them first.",
    });
  }
}
