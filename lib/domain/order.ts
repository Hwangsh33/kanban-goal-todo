/** Fractional-index ordering of cards inside one board column (status within a week). */

export const ORDER_STEP = 1024;
export const MIN_ORDER_GAP = 1e-6;

export type OrderedItem = { id: string; order: number };

export class NeighborNotFoundError extends Error {
  constructor(id: string) {
    super(`이웃 카드를 찾을 수 없습니다: ${id}`);
  }
}

export function orderBetween(before: number | null | undefined, after: number | null | undefined): number {
  if (before != null && after != null) return (before + after) / 2;
  if (before != null) return before + ORDER_STEP;
  if (after != null) return after - ORDER_STEP;
  return ORDER_STEP;
}

export function needsRenumber(before: number | null | undefined, after: number | null | undefined): boolean {
  return before != null && after != null && after - before < MIN_ORDER_GAP;
}

/**
 * Order for a card dropped into `column` (the target column sorted by order, without the moved
 * card). `beforeId` is the card that ends up directly above, `afterId` directly below; a missing
 * side is derived from the full column so filtered views still produce a consistent order.
 * When the neighbour gap is below MIN_ORDER_GAP the whole column is renumbered first.
 */
export function computeMoveOrder(
  column: OrderedItem[],
  neighbours: { beforeId?: string | null; afterId?: string | null },
): { order: number; renumbered: OrderedItem[] | null } {
  const indexOf = (id: string) => {
    const i = column.findIndex((c) => c.id === id);
    if (i < 0) throw new NeighborNotFoundError(id);
    return i;
  };

  let beforeIdx: number | null;
  let afterIdx: number | null;
  if (neighbours.beforeId && neighbours.afterId) {
    beforeIdx = indexOf(neighbours.beforeId);
    afterIdx = indexOf(neighbours.afterId);
  } else if (neighbours.beforeId) {
    beforeIdx = indexOf(neighbours.beforeId);
    afterIdx = beforeIdx + 1 < column.length ? beforeIdx + 1 : null;
  } else if (neighbours.afterId) {
    afterIdx = indexOf(neighbours.afterId);
    beforeIdx = afterIdx > 0 ? afterIdx - 1 : null;
  } else {
    beforeIdx = column.length > 0 ? column.length - 1 : null;
    afterIdx = null;
  }

  let items = column;
  let renumbered: OrderedItem[] | null = null;
  const orderAt = (i: number | null) => (i == null ? null : items[i].order);

  if (needsRenumber(orderAt(beforeIdx), orderAt(afterIdx))) {
    renumbered = column.map((c, i) => ({ id: c.id, order: (i + 1) * ORDER_STEP }));
    items = renumbered;
  }

  return { order: orderBetween(orderAt(beforeIdx), orderAt(afterIdx)), renumbered };
}
