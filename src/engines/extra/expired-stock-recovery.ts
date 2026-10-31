/** Staff physical-stock recovery window, based on the customer cutoff calendar date.
 * The cutoff date and the following day are actionable; later dates are history.
 * Unlike storefront orderability, time-of-day after cutoff does not block staff.
 */
export function expiredStockRecoveryDates(cutoffIso: string | null): [string, string] | null {
  if (!cutoffIso) return null;
  const instant = new Date(cutoffIso);
  if (!Number.isFinite(instant.getTime())) return null;
  const expiryDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(instant);
  const next = new Date(expiryDay + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  return [expiryDay, next.toISOString().slice(0, 10)];
}

export function canRecoverExpiredStock(cutoffIso: string | null, todayYmd: string): boolean {
  const days = expiredStockRecoveryDates(cutoffIso);
  return days !== null && (todayYmd === days[0] || todayYmd === days[1]);
}

export function canAssignExpiredStockToPickupDate(
  cutoffIso: string | null, pickupDate: string,
): boolean {
  const days = expiredStockRecoveryDates(cutoffIso);
  return days !== null && (pickupDate === days[0] || pickupDate === days[1]);
}
