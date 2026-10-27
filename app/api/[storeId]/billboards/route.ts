import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { handleApiError, parseBody, requireStoreOwner } from "@/lib/api";
import { billboardSchema } from "@/lib/validations";

type Params = { params: Promise<{ storeId: string }> };

export async function POST(req: Request, props: Params) {
  try {
    const { storeId } = await props.params;
    await requireStoreOwner(storeId);
    const { label, imageUrl } = await parseBody(req, billboardSchema);

    const billboard = await prismadb.billboard.create({
      data: { label, imageUrl, storeId },
    });
    return NextResponse.json(billboard);
  } catch (error) {
    return handleApiError("BILLBOARDS_POST", error);
  }
}

export async function GET(_req: Request, props: Params) {
  try {
    const { storeId } = await props.params;
    const billboards = await prismadb.billboard.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(billboards);
  } catch (error) {
    return handleApiError("BILLBOARDS_GET", error);
  }
}
