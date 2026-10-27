import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";
import { ApiError, assertFound, handleApiError, parseBody } from "@/lib/api";
import { storeSchema } from "@/lib/validations";

type Params = { params: Promise<{ storeId: string }> };

export async function PATCH(req: Request, props: Params) {
  try {
    const { storeId } = await props.params;
    const { userId } = await auth();
    if (!userId) throw new ApiError(401, "Unauthenticated");
    const { name } = await parseBody(req, storeSchema);

    // Scoped by userId: another user's store simply isn't found.
    const result = await prismadb.store.updateMany({
      where: { id: storeId, userId },
      data: { name },
    });
    return NextResponse.json(assertFound(result, "Store"));
  } catch (error) {
    return handleApiError("STORE_PATCH", error);
  }
}

export async function DELETE(_req: Request, props: Params) {
  try {
    const { storeId } = await props.params;
    const { userId } = await auth();
    if (!userId) throw new ApiError(401, "Unauthenticated");

    const result = await prismadb.store.deleteMany({ where: { id: storeId, userId } });
    return NextResponse.json(assertFound(result, "Store"));
  } catch (error) {
    return handleApiError("STORE_DELETE", error, {
      conflictMessage:
        "This store still has products, categories, billboards, sizes, colors or orders. Remove them first.",
    });
  }
}
