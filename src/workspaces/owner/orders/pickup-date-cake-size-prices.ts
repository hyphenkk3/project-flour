/** Overlay pickup-date RPC prices; missing/invalid values keep the current/base price. */
export function displayCakeSizeUnitPrice(
  basePrice: number,
  sizeId: string,
  resolvedBySizeId: Readonly<Record<string, number>>,
): number {
  const resolved = resolvedBySizeId[sizeId];
  return typeof resolved === "number" && Number.isFinite(resolved)
    ? resolved
    : basePrice;
}

export function cakeSizePriceRequestKey(
  pickupDate: string,
  sizeIds: readonly string[],
): string {
  const date = pickupDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const ids = [
    ...new Set(sizeIds.map((id) => id.trim()).filter(Boolean)),
  ].sort();
  return ids.length ? `${date}|${ids.join(",")}` : "";
}

export function isCurrentCakeSizePriceResponse(input: {
  responseKey: string;
  responseAttempt: number;
  currentKey: string;
  currentAttempt: number;
}): boolean {
  return (
    input.responseKey === input.currentKey &&
    input.responseAttempt === input.currentAttempt
  );
}

export function offerableCakeSizeIds(
  cakes: readonly { sizes: readonly { id: string }[] }[],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const cake of cakes) {
    for (const size of cake.sizes) {
      const id = size.id.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function verifiedSelectedCakeSizePrices(input: {
  pickupDate: string;
  sizeIds: readonly string[];
  prices: Readonly<Record<string, number>>;
  status: "idle" | "loading" | "error" | "ready";
}): boolean {
  if (input.sizeIds.length === 0) return true;
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(input.pickupDate.trim()) &&
    input.status === "ready" &&
    input.sizeIds.every((id) => Number.isFinite(input.prices[id]))
  );
}

/** A saved line keeps its snapshot only when its identity, cake and size match. */
export function newlyPricedCakeSizeIds(
  items: readonly { itemId?: string; cakeId: string; cakeSizeId: string }[],
  saved: readonly { id: string; cakeId: string; cakeSizeId: string }[],
): string[] {
  return items
    .filter(
      (item) =>
        !saved.some(
          (row) =>
            row.id === item.itemId &&
            row.cakeId === item.cakeId &&
            row.cakeSizeId === item.cakeSizeId,
        ),
    )
    .map((item) => item.cakeSizeId);
}

/** Compare the submitted form with the state whose prices were verified. */
export function verifiedStaffCakeSizeSubmission(input: {
  verified: boolean;
  formData: FormData;
  pickupDate: string;
  itemsJson: string;
}): boolean {
  return (
    input.verified &&
    input.formData.get("pickup_date") === input.pickupDate &&
    input.formData.get("items_json") === input.itemsJson
  );
}
