import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { handleApiError, parseBody, requireStoreOwner } from "@/lib/api";
import { colorSchema } from "@/lib/validations";

type Params = { params: Promise<{ storeId: string }> };

export async function POST(req: Request, props: Params) {
  try {
    const { storeId } = await props.params;
    await requireStoreOwner(storeId);
    const { name, value } = await parseBody(req, colorSchema);

    const color = await prismadb.color.create({ data: { name, value, storeId } });
    return NextResponse.json(color);
  } catch (error) {
    return handleApiError("COLORS_POST", error);
  }
}

export async function GET(_req: Request, props: Params) {
  try {
    const { storeId } = await props.params;
    const colors = await prismadb.color.findMany({
      where: { storeId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(colors);
  } catch (error) {
    return handleApiError("COLORS_GET", error);
  }
}
