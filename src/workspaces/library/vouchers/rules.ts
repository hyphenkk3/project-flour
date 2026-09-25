import {
  emptyCatalogueRules,
  normalizeCatalogueSizeLabel,
  parseCatalogueOrderType,
} from "@/engines/vouchers/catalogue-voucher";
import type {
  CatalogueOrderType,
  CatalogueVoucherRules,
} from "@/types/catalogue-voucher";
import { parseOptionalDate } from "@/workspaces/library/labels";

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const key = value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(key);
  }
  return next;
}

export function parseCatalogueRulesFromForm(
  formData: FormData,
  knownCakeIds: ReadonlySet<string>,
  knownSizeLabels: readonly string[],
): CatalogueVoucherRules | string {
  const orderFrom = parseOptionalDate(formData.get("order_date_from"));
  const orderUntil = parseOptionalDate(formData.get("order_date_until"));
  const fulfilmentFrom = parseOptionalDate(formData.get("fulfilment_date_from"));
  const fulfilmentUntil = parseOptionalDate(
    formData.get("fulfilment_date_until"),
  );
  const minRaw = String(formData.get("minimum_cake_subtotal") ?? "").trim();
  const cakeIds = uniqueStrings(
    formData.getAll("eligible_cake").map((value) => String(value)),
  );
  const sizeLabels = uniqueStrings(
    formData.getAll("eligible_size").map((value) => String(value)),
  );
  const orderTypeRaw = uniqueStrings(
    formData.getAll("eligible_order_type").map((value) => String(value)),
  );
  const orderTypes: CatalogueOrderType[] = [];
  for (const value of orderTypeRaw) {
    const parsedType = parseCatalogueOrderType(value);
    if (!parsedType) {
      return "One or more eligible order types are not valid.";
    }
    orderTypes.push(parsedType);
  }

  if (orderFrom && orderUntil && orderUntil < orderFrom) {
    return "Order date until must be on or after order date from.";
  }
  if (fulfilmentFrom && fulfilmentUntil && fulfilmentUntil < fulfilmentFrom) {
    return "Fulfilment date until must be on or after fulfilment date from.";
  }

  let minimumCakeSubtotal: number | null = null;
  if (minRaw) {
    const amount = Number(minRaw);
    if (!Number.isFinite(amount) || amount < 0) {
      return "Minimum cake subtotal must be zero or greater.";
    }
    minimumCakeSubtotal = amount;
  }

  const knownSizes = new Set(
    knownSizeLabels
      .map((label) => normalizeCatalogueSizeLabel(label))
      .filter((label): label is string => Boolean(label)),
  );
  for (const cakeId of cakeIds) {
    if (!knownCakeIds.has(cakeId)) {
      return "One or more eligible cakes are not valid.";
    }
  }
  for (const label of sizeLabels) {
    const normalized = normalizeCatalogueSizeLabel(label);
    if (!normalized || !knownSizes.has(normalized)) {
      return "One or more eligible cake sizes are not valid.";
    }
  }

  return {
    orderDate:
      orderFrom || orderUntil ? { from: orderFrom, until: orderUntil } : null,
    fulfilmentDate:
      fulfilmentFrom || fulfilmentUntil
        ? { from: fulfilmentFrom, until: fulfilmentUntil }
        : null,
    minimumCakeSubtotal,
    cakeIds,
    sizeLabels,
    cakeNames: [],
    orderTypes,
  };
}

export function catalogueRulesAreEmpty(rules: CatalogueVoucherRules): boolean {
  return (
    rules.orderDate == null &&
    rules.fulfilmentDate == null &&
    rules.minimumCakeSubtotal == null &&
    rules.cakeIds.length === 0 &&
    rules.sizeLabels.length === 0 &&
    rules.orderTypes.length === 0
  );
}

export { emptyCatalogueRules };
