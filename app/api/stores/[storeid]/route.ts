import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prismadb from "@/lib/prismadb";
export async function PATCH(
  req: Request, // convention to use like this 
  { params }: { params: { storeId: string } }
) {
  try {
    const { userId } = auth();
  //  const body = await req.json();
  //  const { name } = body;
    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }
    
    if (!params.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }
    const store = await prismadb.store.deleteMany({
      where: {
        id: params.storeId,
        userId,
      }
    });
    return NextResponse.json(store);
  } catch (error) {
    console.log("[STORE_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
