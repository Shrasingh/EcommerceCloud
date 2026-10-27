import { OrderClient } from "./components/client";
import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { OrderColumn } from "./components/columns";
import { formatter } from "@/lib/utils";
import { orderTotal } from "@/lib/analytics";
import { requireStoreAccess } from "@/lib/require-store";

const OrdersPage = async ({
  params: paramsPromise
}: {
  params: Promise<{ storeId: string }>
}) => {
  const params = await paramsPromise;
  await requireStoreAccess(params.storeId);
  const orders = await prismadb.order.findMany({
    where: {
      storeId: params.storeId,
    },
    include: {
      orderItems: {
        include: {
          product: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const formattedOrders: OrderColumn[] = orders.map((order) => {
    // Prefer the price recorded at checkout; orders from before price tracking
    // fall back to today's price and are labelled as estimates.
    const total = orderTotal({
      items: order.orderItems.map((item) => ({
        recordedPrice: item.unitPrice?.toNumber() ?? null,
        currentPrice: item.product.price.toNumber(),
      })),
    });
    return {
      id: order.id,
      phone: order.phone,
      address: order.address,
      products: order.orderItems.map((orderItem) => orderItem.product.name).join(", "),
      totalPrice: total.estimated
        ? `≈ ${formatter.format(total.total)} (estimated)`
        : formatter.format(total.total),
      isPaid: order.isPaid,
      createdAt: format(order.createdAt, "MMMM do, yyyy"),
    };
  });

  return (
    <div className="flex-col ">
      <div className="flex-1 space-y-4 p-8  pt-6 ">
        <OrderClient data={formattedOrders} />
      </div>
    </div>
  );
};

export default OrdersPage;
