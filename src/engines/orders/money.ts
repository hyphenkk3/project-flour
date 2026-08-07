/**
 * Safe monetary helpers for Ringgit amounts stored as numeric(10,2).
 * Work in integer cents to avoid floating-point drift.
 */

export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function addMoney(...amounts: number[]): number {
  return fromCents(amounts.reduce((sum, amount) => sum + toCents(amount), 0));
}

export function subtractMoney(left: number, right: number): number {
  return fromCents(toCents(left) - toCents(right));
}

/** Compare two money values with cent precision. */
export function moneyCompare(left: number, right: number): number {
  return toCents(left) - toCents(right);
}
