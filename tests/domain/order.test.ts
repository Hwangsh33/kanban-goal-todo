import { describe, expect, it } from "vitest";
import {
  computeMoveOrder,
  MIN_ORDER_GAP,
  needsRenumber,
  orderBetween,
  ORDER_STEP,
} from "@/lib/domain/order";

const col = (...orders: number[]) => orders.map((order, i) => ({ id: `c${i}`, order }));

describe("orderBetween (fractional index)", () => {
  it("is the midpoint of two neighbours", () => {
    expect(orderBetween(1000, 2000)).toBe(1500);
    expect(orderBetween(1, 1.5)).toBe(1.25);
  });
  it("goes one step past a single neighbour", () => {
    expect(orderBetween(2000, null)).toBe(2000 + ORDER_STEP);
    expect(orderBetween(null, 2000)).toBe(2000 - ORDER_STEP);
  });
  it("starts at ORDER_STEP in an empty column", () => {
    expect(orderBetween(null, null)).toBe(ORDER_STEP);
  });
});

describe("needsRenumber", () => {
  it("is true only when the gap is below 1e-6", () => {
    expect(MIN_ORDER_GAP).toBe(1e-6);
    expect(needsRenumber(1, 1 + 5e-7)).toBe(true);
    expect(needsRenumber(1, 1 + 2e-6)).toBe(false);
    expect(needsRenumber(null, 1)).toBe(false);
  });
});

describe("computeMoveOrder", () => {
  it("appends to the end when no neighbour is given", () => {
    expect(computeMoveOrder(col(1024, 2048), {})).toEqual({ order: 2048 + ORDER_STEP, renumbered: null });
    expect(computeMoveOrder([], {})).toEqual({ order: ORDER_STEP, renumbered: null });
  });

  it("places between explicit neighbours", () => {
    expect(computeMoveOrder(col(1024, 2048, 3072), { beforeId: "c0", afterId: "c1" }).order).toBe(1536);
  });

  it("derives the missing neighbour from the full column order", () => {
    // Only the card above is known (e.g. a filtered view): the card below is c1.
    expect(computeMoveOrder(col(1024, 2048), { beforeId: "c0" }).order).toBe(1536);
    // Only the card below is known: the card above is c0.
    expect(computeMoveOrder(col(1024, 2048), { afterId: "c1" }).order).toBe(1536);
    // Insert at the top.
    expect(computeMoveOrder(col(1024, 2048), { afterId: "c0" }).order).toBe(1024 - ORDER_STEP);
  });

  it("renumbers the column when the neighbour gap is below 1e-6, keeping relative order", () => {
    const column = col(1, 1 + 4e-7, 5);
    const result = computeMoveOrder(column, { beforeId: "c0", afterId: "c1" });
    expect(result.renumbered).toEqual([
      { id: "c0", order: ORDER_STEP },
      { id: "c1", order: 2 * ORDER_STEP },
      { id: "c2", order: 3 * ORDER_STEP },
    ]);
    expect(result.order).toBe(ORDER_STEP * 1.5);
  });

  it("does not renumber when the gap is large enough", () => {
    expect(computeMoveOrder(col(1, 1 + 2e-6), { beforeId: "c0", afterId: "c1" }).renumbered).toBeNull();
  });

  it("throws for an unknown neighbour id", () => {
    expect(() => computeMoveOrder(col(1024), { beforeId: "nope" })).toThrow();
  });
});
