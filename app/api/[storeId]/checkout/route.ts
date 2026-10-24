import Stripe from "stripe";
import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import stripe from "@/lib/stripe";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  request: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    const { productIds } = await request.json();
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return new NextResponse("Product Ids not found", {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Only sell products that belong to this store and are still available.
    // Sold products are archived by the webhook, so this also blocks re-buying them.
    const products = await prismadb.product.findMany({
      where: {
        id: {
          in: productIds,
        },
        storeId: params.storeId,
        isArchived: false,
        isInStock: true,
      },
    });

    if (products.length === 0) {
      return new NextResponse("No available products", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    products.forEach((product) => {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          product_data: {
            name: product.name,
          },
          // Stripe needs an integer amount in cents (19.99 * 100 = 1998.9999...).
          unit_amount: Math.round(product.price.toNumber() * 100),
        },
      });
    });

    const order = await prismadb.order.create({
      data: {
        storeId: params.storeId,
        isPaid: false,
        orderItems: {
          create: products.map((product) => ({
            product: {
              connect: {
                id: product.id,
              },
            },
          })),
        },
      },
    });

    const session = await stripe.checkout.sessions.create({
      line_items,
      mode: "payment",
      billing_address_collection: "required",
      phone_number_collection: {
        enabled: true,
      },
      success_url: `${process.env.FRONTEND_STORE_URL}/order-success?orderId=${order.id}`,
      cancel_url: `${process.env.FRONTEND_STORE_URL}/cart?canceled=1`,
      metadata: {
        orderId: order.id,
      },
    });

    return NextResponse.json({ url: session.url }, { headers: corsHeaders });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return new NextResponse("Internal Server Error", {
      status: 500,
      headers: corsHeaders,
    });
  }
}
