import prismadb from "@/lib/prismadb";
import { summarizeRevenue } from "@/lib/analytics";
import { requireStoreAccess } from "@/lib/require-store";

/** Everything the store overview page needs, from a single pass over paid orders. */
export async function getDashboardStats(storeId: string) {
  // Authorize at the data layer too, not just on the page that calls this.
  // The ownership query is shared with the page/layout via React cache.
  await requireStoreAccess(storeId);

  const [paidOrders, stockCount] = await Promise.all([
    prismadb.order.findMany({
      where: { storeId, isPaid: true },
      select: {
        createdAt: true,
        orderItems: {
          select: { unitPrice: true, product: { select: { price: true } } },
        },
      },
    }),
    prismadb.product.count({ where: { storeId, isArchived: false } }),
  ]);

  const summary = summarizeRevenue(
    paidOrders.map((order) => ({
      createdAt: order.createdAt,
      items: order.orderItems.map((item) => ({
        recordedPrice: item.unitPrice?.toNumber() ?? null,
        currentPrice: item.product.price.toNumber(),
      })),
    })),
    new Date().getFullYear()
  );

  return {
    totalRevenue: summary.totalRevenue,
    estimatedRevenue: summary.estimatedRevenue,
    estimatedItems: summary.estimatedItems,
    salesCount: paidOrders.length,
    stockCount,
    graphData: summary.graph,
  };
}
