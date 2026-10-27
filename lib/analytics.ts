export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface GraphPoint {
  name: string;
  total: number;
}

export interface RevenueItem {
  /** Price recorded at checkout; null for orders created before price tracking. */
  recordedPrice: number | null;
  /** Today's catalog price, used only as a labelled estimate when nothing was recorded. */
  currentPrice: number;
}

export interface RevenueOrder {
  createdAt: Date;
  items: RevenueItem[];
}

export interface OrderTotal {
  total: number;
  /** True when at least one item had no recorded price. */
  estimated: boolean;
  /** Portion of `total` that comes from current prices. */
  estimatedAmount: number;
  estimatedItems: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Prefers recorded prices; falls back to current prices and reports it. */
export function orderTotal(order: Pick<RevenueOrder, "items">): OrderTotal {
  let total = 0;
  let estimatedAmount = 0;
  let estimatedItems = 0;
  for (const item of order.items) {
    if (item.recordedPrice !== null) {
      total += item.recordedPrice;
    } else {
      total += item.currentPrice;
      estimatedAmount += item.currentPrice;
      estimatedItems++;
    }
  }
  return {
    total: round2(total),
    estimated: estimatedItems > 0,
    estimatedAmount: round2(estimatedAmount),
    estimatedItems,
  };
}

/**
 * Total revenue plus a Jan–Dec breakdown for `year`, and how much of the
 * total is estimated from current prices. Orders from other years count
 * toward the total but not the chart.
 */
export function summarizeRevenue(orders: RevenueOrder[], year: number) {
  const graph: GraphPoint[] = MONTHS.map((name) => ({ name, total: 0 }));
  let totalRevenue = 0;
  let estimatedRevenue = 0;
  let estimatedItems = 0;

  for (const order of orders) {
    const t = orderTotal(order);
    totalRevenue += t.total;
    estimatedRevenue += t.estimatedAmount;
    estimatedItems += t.estimatedItems;
    if (order.createdAt.getFullYear() === year) {
      graph[order.createdAt.getMonth()].total += t.total;
    }
  }

  return {
    totalRevenue: round2(totalRevenue),
    estimatedRevenue: round2(estimatedRevenue),
    estimatedItems,
    graph: graph.map((p) => ({ ...p, total: round2(p.total) })),
  };
}
