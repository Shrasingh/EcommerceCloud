import { describe, expect, it } from "vitest";

import { orderTotal, summarizeRevenue } from "@/lib/analytics";
import { formatAddress } from "@/lib/orders";
import { buildProductWhere } from "@/lib/products";

const recorded = (recordedPrice: number, currentPrice = 999) => ({ recordedPrice, currentPrice });
const legacy = (currentPrice: number) => ({ recordedPrice: null, currentPrice });
const order = (iso: string, ...items: { recordedPrice: number | null; currentPrice: number }[]) => ({
  createdAt: new Date(iso),
  items,
});

describe("orderTotal", () => {
  it("uses recorded prices and ignores the current catalog price", () => {
    expect(orderTotal(order("2026-01-10T12:00:00", recorded(10, 99), recorded(5.5, 1)))).toEqual({
      total: 15.5,
      estimated: false,
      estimatedAmount: 0,
      estimatedItems: 0,
    });
  });

  it("falls back to current prices for legacy items and labels them", () => {
    expect(orderTotal(order("2026-01-10T12:00:00", legacy(20), legacy(5)))).toEqual({
      total: 25,
      estimated: true,
      estimatedAmount: 25,
      estimatedItems: 2,
    });
  });

  it("reports the estimated portion of a mixed order", () => {
    expect(orderTotal(order("2026-01-10T12:00:00", recorded(10), legacy(4)))).toMatchObject({
      total: 14,
      estimated: true,
      estimatedAmount: 4,
      estimatedItems: 1,
    });
  });
});

describe("summarizeRevenue", () => {
  it("buckets the current year by month and keeps other years out of the chart", () => {
    const { totalRevenue, graph, estimatedRevenue, estimatedItems } = summarizeRevenue(
      [
        order("2026-01-15T12:00:00", recorded(100)),
        order("2026-01-20T12:00:00", recorded(50)),
        order("2026-03-02T12:00:00", legacy(20)),
        order("2025-01-05T12:00:00", recorded(999)), // previous year
      ],
      2026
    );

    expect(totalRevenue).toBe(1169);
    expect(estimatedRevenue).toBe(20);
    expect(estimatedItems).toBe(1);
    expect(graph).toHaveLength(12);
    expect(graph[0]).toEqual({ name: "Jan", total: 150 });
    expect(graph[2]).toEqual({ name: "Mar", total: 20 });
    expect(graph[1].total).toBe(0);
  });

  it("reports nothing as estimated when every price was recorded", () => {
    const summary = summarizeRevenue([order("2026-05-01T12:00:00", recorded(10), recorded(2.5))], 2026);
    expect(summary.estimatedItems).toBe(0);
    expect(summary.estimatedRevenue).toBe(0);
  });

  it("rounds away floating point noise", () => {
    const { totalRevenue } = summarizeRevenue([order("2026-05-01T12:00:00", recorded(0.1), recorded(0.2))], 2026);
    expect(totalRevenue).toBe(0.3);
  });

  it("handles no orders", () => {
    const { totalRevenue, graph } = summarizeRevenue([], 2026);
    expect(totalRevenue).toBe(0);
    expect(graph.every((p) => p.total === 0)).toBe(true);
  });
});

describe("formatAddress", () => {
  it("skips null, undefined and blank parts", () => {
    expect(
      formatAddress({ line1: "12 Main St", line2: null, city: "Austin", state: " ", postal_code: "78701", country: "US" })
    ).toBe("12 Main St, Austin, 78701, US");
  });

  it("returns an empty string for a missing address", () => {
    expect(formatAddress(null)).toBe("");
    expect(formatAddress(undefined)).toBe("");
  });
});

describe("buildProductWhere", () => {
  it("always scopes to the store and hides archived products", () => {
    expect(buildProductWhere("s1", {})).toMatchObject({ storeId: "s1", isArchived: false });
  });

  it("only filters featured products when isFeatured=true", () => {
    expect(buildProductWhere("s1", { isFeatured: "true" }).isFeatured).toBe(true);
    expect(buildProductWhere("s1", { isFeatured: "false" }).isFeatured).toBeUndefined();
  });

  it("builds a price range and case-insensitive search", () => {
    const where = buildProductWhere("s1", { minPrice: 10, search: "lamp" });
    expect(where.price).toEqual({ gte: 10, lte: undefined });
    expect(where.OR).toHaveLength(4);
    expect(where.OR?.[0]).toEqual({ name: { contains: "lamp", mode: "insensitive" } });
  });
});
