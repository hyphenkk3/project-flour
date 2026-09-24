export const CATALOGUE_VOUCHER_SELECTION_KEY =
  "whitebird-catalogue-voucher-selection-v1";

export const CATALOGUE_VOUCHER_SELECTION_EVENT =
  "whitebird-catalogue-voucher-selection-changed";

export function readSelectedCatalogueVoucherId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(CATALOGUE_VOUCHER_SELECTION_KEY);
    return value?.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function writeSelectedCatalogueVoucherId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!id) {
      window.sessionStorage.removeItem(CATALOGUE_VOUCHER_SELECTION_KEY);
    } else {
      window.sessionStorage.setItem(CATALOGUE_VOUCHER_SELECTION_KEY, id);
    }
    window.dispatchEvent(new Event(CATALOGUE_VOUCHER_SELECTION_EVENT));
  } catch {
    // sessionStorage may be unavailable
  }
}

export function subscribeCatalogueVoucherSelection(
  onChange: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CATALOGUE_VOUCHER_SELECTION_EVENT, onChange);
  return () => {
    window.removeEventListener(CATALOGUE_VOUCHER_SELECTION_EVENT, onChange);
  };
}
