import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { ApiError, assertFound, handleApiError, parseBody, requireStoreOwner } from "@/lib/api";
import { billboardSchema } from "@/lib/validations";

type Params = { params: Promise<{ storeId: string; billboardId: string }> };

export async function GET(_req: Request, props: Params) {
  try {
    const { storeId, billboardId } = await props.params;
    const billboard = await prismadb.billboard.findFirst({
      where: { id: billboardId, storeId },
    });
    if (!billboard) throw new ApiError(404, "Billboard not found");
    return NextResponse.json(billboard);
  } catch (error) {
    return handleApiError("BILLBOARD_GET", error);
  }
}

export async function PATCH(req: Request, props: Params) {
  try {
    const { storeId, billboardId } = await props.params;
    await requireStoreOwner(storeId);
    const { label, imageUrl } = await parseBody(req, billboardSchema);

    const result = await prismadb.billboard.updateMany({
      where: { id: billboardId, storeId },
      data: { label, imageUrl },
    });
    return NextResponse.json(assertFound(result, "Billboard"));
  } catch (error) {
    return handleApiError("BILLBOARD_PATCH", error);
  }
}

export async function DELETE(_req: Request, props: Params) {
  try {
    const { storeId, billboardId } = await props.params;
    await requireStoreOwner(storeId);

    const result = await prismadb.billboard.deleteMany({
      where: { id: billboardId, storeId },
    });
    return NextResponse.json(assertFound(result, "Billboard"));
  } catch (error) {
    return handleApiError("BILLBOARD_DELETE", error, {
      conflictMessage: "This billboard is used by one or more categories. Reassign or delete them first.",
    });
  }
}
