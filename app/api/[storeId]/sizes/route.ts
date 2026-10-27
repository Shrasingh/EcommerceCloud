import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { handleApiError, parseBody, requireStoreOwner } from "@/lib/api";
import { sizeSchema } from "@/lib/validations";

type Params = { params: Promise<{ storeId: string }> };

export async function POST(req: Request, props: Params) {
  try {
    const { storeId } = await props.params;
    await requireStoreOwner(storeId);
    const { name, value } = await parseBody(req, sizeSchema);

    const size = await prismadb.size.create({ data: { name, value, storeId } });
    return NextResponse.json(size);
  } catch (error) {
    return handleApiError("SIZES_POST", error);
  }
}

export async function GET(_req: Request, props: Params) {
  try {
    const { storeId } = await props.params;
    const sizes = await prismadb.size.findMany({
      where: { storeId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(sizes);
  } catch (error) {
    return handleApiError("SIZES_GET", error);
  }
}
