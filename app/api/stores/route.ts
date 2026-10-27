import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";
import { ApiError, handleApiError, parseBody } from "@/lib/api";
import { storeSchema } from "@/lib/validations";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) throw new ApiError(401, "Unauthenticated");
    const { name } = await parseBody(req, storeSchema);

    const store = await prismadb.store.create({ data: { name, userId } });
    return NextResponse.json(store);
  } catch (error) {
    return handleApiError("STORES_POST", error);
  }
}
