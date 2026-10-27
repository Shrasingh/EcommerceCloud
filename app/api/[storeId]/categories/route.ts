import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { assertRefsInStore, handleApiError, parseBody, requireStoreOwner } from "@/lib/api";
import { categorySchema } from "@/lib/validations";

type Params = { params: Promise<{ storeId: string }> };

export async function POST(req: Request, props: Params) {
  try {
    const { storeId } = await props.params;
    await requireStoreOwner(storeId);
    const { name, billboardId } = await parseBody(req, categorySchema);
    await assertRefsInStore(storeId, { billboardId });

    const category = await prismadb.category.create({
      data: { name, billboardId, storeId },
    });
    return NextResponse.json(category);
  } catch (error) {
    return handleApiError("CATEGORIES_POST", error);
  }
}

export async function GET(_req: Request, props: Params) {
  try {
    const { storeId } = await props.params;
    const categories = await prismadb.category.findMany({
      where: { storeId },
      include: { billboard: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(categories);
  } catch (error) {
    return handleApiError("CATEGORIES_GET", error);
  }
}
