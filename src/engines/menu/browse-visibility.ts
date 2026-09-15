/**
 * Browse existence vs currently-orderable.
 * Collection membership remains orderability / publication context.
 * Live Library status is enough for Browse discovery.
 */

export function isLiveLibraryCakeStatus(status: string): boolean {
  return status === "active" || status === "seasonal";
}

export function isBrowseDiscoverableLibraryCake(input: {
  status: string;
  sizeCount: number;
  hasQualifyingCustomerFacingCatalogue: boolean;
}): boolean {
  if (input.sizeCount < 1) return false;
  if (input.hasQualifyingCustomerFacingCatalogue) return true;
  return isLiveLibraryCakeStatus(input.status);
}
