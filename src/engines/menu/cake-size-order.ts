/**
 * Catalogue cake-size display order: numeric inch/size value, not insertion
 * or lexical order. "10"" follows "8"", never precedes "4"".
 */

const SIZE_NUMBER = /(\d+(?:\.\d+)?)/;

export function cakeSizeNumericValue(label: string): number {
  const match = SIZE_NUMBER.exec(label);
  if (!match) {
    return Number.POSITIVE_INFINITY;
  }
  return Number(match[1]);
}

export function compareCakeSizeLabels(a: string, b: string): number {
  const diff = cakeSizeNumericValue(a) - cakeSizeNumericValue(b);
  if (diff !== 0) {
    return diff;
  }
  return a.localeCompare(b, "en");
}

export function sortCakeSizesByNumericLabel<T>(
  items: readonly T[],
  getLabel: (item: T) => string,
): T[] {
  return [...items].sort((a, b) =>
    compareCakeSizeLabels(getLabel(a), getLabel(b)),
  );
}
