/**
 * Reconciles a Bakery order's cake requirements with physical Fresh Pick rows.
 * Order items are grouped by catalogue cake + size, while each extra_stock row
 * represents exactly one physical cake. The legacy orders.extra_stock_id
 * pointer is unioned with extra_stock.order_id and deduplicated by stock id.
 */

export type BakeryCakeRequirementInput = {
  cakeId: string | null;
  cakeName: string | null;
  sizeId: string | null;
  sizeLabel: string | null;
  quantity: number;
};

export type BakeryAssignedStockInput = {
  id: string;
  orderId: string | null;
  lifecycle: string;
  soldAt: string | null;
  cutIntoSlicesAt: string | null;
  cakeId: string | null;
  cakeName: string;
  sizeId: string | null;
  sizeLabel: string;
  walkInHeldUntil?: string | null;
  legacyLinkConflict?: boolean;
};

export type BakeryCakeAllocationLine = {
  key: string;
  cakeId: string | null;
  cakeName: string;
  sizeId: string | null;
  sizeLabel: string;
  orderedQuantity: number;
  assignedQuantity: number;
  remainingQuantity: number;
};

export type BakeryAllocationSummary = {
  status: "verified" | "needs_review";
  lines: BakeryCakeAllocationLine[];
  issues: string[];
  totalOrderedQuantity: number;
  totalAssignedQuantity: number;
  totalRemainingQuantity: number;
  fullyCovered: boolean;
};

function normalizeLabel(value: string | null | undefined): string {
  // Keep the same legacy fallback as assign_extra_stock_to_order: lower(trim()).
  return (value ?? "").trim().toLocaleLowerCase("en");
}

function groupKey(item: BakeryCakeRequirementInput): string {
  const cake = item.cakeId ? `id:${item.cakeId}` : `name:${normalizeLabel(item.cakeName)}`;
  const size = item.sizeId ? `id:${item.sizeId}` : `label:${normalizeLabel(item.sizeLabel)}`;
  return `${cake}|${size}`;
}

function stockMatchesItem(
  stock: BakeryAssignedStockInput,
  item: BakeryCakeRequirementInput,
): boolean {
  const cakeMatches = stock.cakeId
    ? item.cakeId === stock.cakeId
    : normalizeLabel(item.cakeName) === normalizeLabel(stock.cakeName);
  const sizeMatches = stock.sizeId
    ? item.sizeId === stock.sizeId
    : normalizeLabel(item.sizeLabel) === normalizeLabel(stock.sizeLabel);
  return cakeMatches && sizeMatches;
}

function sameStockRecord(
  left: BakeryAssignedStockInput,
  right: BakeryAssignedStockInput,
): boolean {
  return (
    left.orderId === right.orderId &&
    left.lifecycle === right.lifecycle &&
    left.soldAt === right.soldAt &&
    left.cutIntoSlicesAt === right.cutIntoSlicesAt &&
    left.cakeId === right.cakeId &&
    left.cakeName === right.cakeName &&
    left.sizeId === right.sizeId &&
    left.sizeLabel === right.sizeLabel &&
    (left.walkInHeldUntil ?? null) === (right.walkInHeldUntil ?? null) &&
    (left.legacyLinkConflict ?? false) === (right.legacyLinkConflict ?? false)
  );
}

export function summarizeBakeryFreshPickAllocations(input: {
  orderId: string;
  primaryStockId: string | null;
  cakeRequirements: BakeryCakeRequirementInput[];
  stockRows: BakeryAssignedStockInput[];
  now?: Date;
}): BakeryAllocationSummary {
  const issues = new Set<string>();
  const groups = new Map<string, BakeryCakeAllocationLine>();
  const groupMembers = new Map<string, BakeryCakeRequirementInput[]>();
  const assignedIds = new Map<string, Set<string>>();
  const nowMs = (input.now ?? new Date()).getTime();

  if (input.cakeRequirements.length === 0) {
    issues.add("The order has no cake requirements to reconcile.");
  }

  for (const item of input.cakeRequirements) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      issues.add("An order cake quantity is invalid.");
      continue;
    }
    const key = groupKey(item);
    const current = groups.get(key);
    if (current) {
      current.orderedQuantity += item.quantity;
      groupMembers.get(key)?.push(item);
    } else {
      groups.set(key, {
        key,
        cakeId: item.cakeId,
        cakeName: item.cakeName?.trim() || "Cake",
        sizeId: item.sizeId,
        sizeLabel: item.sizeLabel?.trim() || "Size",
        orderedQuantity: item.quantity,
        assignedQuantity: 0,
        remainingQuantity: item.quantity,
      });
      groupMembers.set(key, [item]);
      assignedIds.set(key, new Set());
    }
  }

  const uniqueRows = new Map<string, BakeryAssignedStockInput>();
  for (const row of input.stockRows) {
    if (row.orderId !== input.orderId && row.id !== input.primaryStockId) continue;
    const existing = uniqueRows.get(row.id);
    if (existing && !sameStockRecord(existing, row)) {
      issues.add("A Fresh Pick stock link returned conflicting records.");
      continue;
    }
    uniqueRows.set(row.id, row);
  }

  // A dangling legacy pointer is inconsistent historical data. Treating it as
  // zero allocation could invite duplicate production, so fail visibly.
  if (input.primaryStockId && !uniqueRows.has(input.primaryStockId)) {
    issues.add("The legacy Fresh Pick pointer does not resolve to a stock record.");
  }

  for (const stock of uniqueRows.values()) {
    if (stock.legacyLinkConflict) {
      issues.add("A Fresh Pick stock record is also referenced by another order.");
      continue;
    }
    if (stock.orderId !== null && stock.orderId !== input.orderId) {
      issues.add("A legacy Fresh Pick link points to a different order.");
      continue;
    }
    const holdUntilMs = stock.walkInHeldUntil ? Date.parse(stock.walkInHeldUntil) : null;
    if (
      stock.lifecycle !== "confirmed" ||
      !stock.soldAt ||
      stock.cutIntoSlicesAt !== null ||
      (stock.walkInHeldUntil && (holdUntilMs === null || !Number.isFinite(holdUntilMs) || holdUntilMs >= nowMs))
    ) {
      issues.add("An assigned Fresh Pick record is not in a usable whole-cake state.");
      continue;
    }

    const matchingGroups = [...groupMembers.entries()].filter(([, members]) =>
      members.some((item) => stockMatchesItem(stock, item)),
    );
    if (matchingGroups.length === 0) {
      issues.add("An assigned Fresh Pick cake does not match an order cake requirement.");
      continue;
    }
    if (matchingGroups.length > 1) {
      issues.add("A legacy Fresh Pick cake link matches more than one cake-and-size requirement.");
      continue;
    }
    assignedIds.get(matchingGroups[0][0])?.add(stock.id);
  }

  for (const [key, line] of groups) {
    const assigned = assignedIds.get(key)?.size ?? 0;
    line.assignedQuantity = assigned;
    if (assigned > line.orderedQuantity) {
      issues.add("Assigned Fresh Pick quantity exceeds the order quantity for a cake-and-size requirement.");
    }
    line.remainingQuantity = Math.max(0, line.orderedQuantity - assigned);
  }

  const lines = [...groups.values()];
  const totalOrderedQuantity = lines.reduce((sum, line) => sum + line.orderedQuantity, 0);
  const totalAssignedQuantity = lines.reduce((sum, line) => sum + line.assignedQuantity, 0);
  const totalRemainingQuantity = lines.reduce((sum, line) => sum + line.remainingQuantity, 0);
  const issueList = [...issues];
  const status = issueList.length > 0 ? "needs_review" : "verified";

  return {
    status,
    lines,
    issues: issueList,
    totalOrderedQuantity,
    totalAssignedQuantity,
    totalRemainingQuantity,
    fullyCovered:
      status === "verified" && lines.length > 0 && totalRemainingQuantity === 0,
  };
}

/** Shared user-safe guard for both the UI surface and the server action. */
export function bakeryFreshPickStartBlock(
  summary: BakeryAllocationSummary,
): "review" | "fully_covered" | null {
  if (summary.status !== "verified") return "review";
  if (summary.fullyCovered) return "fully_covered";
  return null;
}
