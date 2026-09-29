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
