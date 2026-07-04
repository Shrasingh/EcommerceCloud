import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";
export async function POST(
    req: Request,
{ params } :  { params: {storeId: string }}
) {
  try {
    const { userId } = auth();
    const body = await req.json();
    const {
      name ,
      price,
      categoryId,
      colorId,
      sizeId,
      images,
      isFeatured,
      isArchived } = body;
    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }
    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }
    if(!images || !images.length){
      return new NextResponse("Images are required",{status: 400}); 
   }
    if(!price){
        return new NextResponse("Price is required",{status: 400});
    }
    if(!categoryId){
       return new NextResponse("Category Id is required",{status: 400}); 
    }
    if(!sizeId){
      return new NextResponse("Size Id is required",{status: 400}); 
   }
   if(!colorId){
    return new NextResponse("Color Id is required",{status: 400}); 
 }
    const storeByUserId = await prismadb.store.findFirst({
        where: {
            id: params.storeId,
            userId
        }
    })
    if(!storeByUserId){
        return new NextResponse("Unauthorized",{status: 403});
    }
    const product = await prismadb.product.create({
      data: {
        name,
        price,
        isFeatured,
        isArchived,
        categoryId,
        colorId,
        sizeId,
        storeId: params.storeId,
        images: {
          createMany: {
            data: [...images.map((image : {url : string}) => image)]
          }
        }
      },
    });
    return NextResponse.json(product);
  } catch (error) {
    console.log('[PRODUCTS_POST]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(
    req: Request,
{ params } :  { params: {storeId: string }}
) {
  try {
    
    const { searchParams } =new URL(req.url);

    const categoryId = searchParams.get("categoryId") ||  undefined;
    const colorId = searchParams.get("colorId") || undefined;

    const sizeId = searchParams.get("sizeId") || undefined;
    const isFeatured = searchParams.get("isFeatured") ;
    const search = searchParams.get("search")?.trim() || undefined;
    const minPriceParam = searchParams.get("minPrice");
    const maxPriceParam = searchParams.get("maxPrice");
    const minPrice = minPriceParam ? Number(minPriceParam) : undefined;
    const maxPrice = maxPriceParam ? Number(maxPriceParam) : undefined;

    if(!params.storeId){
       return new NextResponse("Store id is required",{status: 400});
    }

    // Case-insensitive search across name, brand, description and category name.
    const searchFilter = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { brand: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
            { category: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {};

    const priceFilter =
      minPrice !== undefined || maxPrice !== undefined
        ? { price: { gte: minPrice, lte: maxPrice } }
        : {};

    const products = await prismadb.product.findMany({
      where: {
        storeId: params.storeId,
        categoryId: categoryId,
        colorId,
        sizeId,
        isFeatured: isFeatured ? true : undefined,
        isArchived: false,
        ...searchFilter,
        ...priceFilter,
      },
      include: {
        images: true,
        category: true,
        color: true,
        size: true
      },
      orderBy: {
      createdAt: 'desc'
    }

  });

    return NextResponse.json(products);
  } catch (error) {
    console.log('[PRODUCTS_GET]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
