/**
 * Catalogue voucher eligibility — one engine for discovery, cart, crew, and apply.
 * Optional/unconfigured rules impose no restriction.
 * Different rule types are AND. Multi-value cake/size selections are OR.
 * Cake + size must be satisfied by the same order line.
 * Minimum cake subtotal is >= configured amount (not August Promo's > RM100).
 */

import {
  fromCents,
  moneyCompare,
  toCents,
} from "@/engines/orders/money";
import { calculateCakeSubtotal } from "@/engines/orders/totals";
import type {
  CatalogueConditionResult,
  CatalogueDateBounds,
  CatalogueEligibilityInput,
  CatalogueEligibilityResult,
  CatalogueOrderItem,
  CatalogueVoucherRecord,
  CatalogueVoucherRules,
} from "@/types/catalogue-voucher";
import { CATALOGUE_VOUCHER_ADJUSTMENT_CODE } from "@/types/catalogue-voucher";
import type { LibraryVoucherType } from "@/types/library-voucher";

export { CATALOGUE_VOUCHER_ADJUSTMENT_CODE };

export function emptyCatalogueRules(): CatalogueVoucherRules {
  return {
    orderDate: null,
    fulfilmentDate: null,
    minimumCakeSubtotal: null,
    cakeIds: [],
    sizeLabels: [],
    cakeNames: [],
  };
}

export const COMMON_CATALOGUE_SIZE_LABELS = ['4"', '6"', '8"'] as const;

export function formatCatalogueVoucherHeadline(
  voucher: Pick<CatalogueVoucherRecord, "voucherType" | "value" | "code">,
): string {
  if (voucher.voucherType === "percentage") {
    return `${voucher.value}% OFF`;
  }
  if (voucher.voucherType === "fixed_amount") {
    return `RM${voucher.value} OFF`;
  }
  return voucher.code;
}

export function normalizeCatalogueSizeLabel(
  value: string | null | undefined,
): string | null {
  const compact = String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/''/g, '"')
    .replace(/″/g, '"');
  return compact.length > 0 ? compact : null;
}

function inclusiveDateContains(
  bounds: CatalogueDateBounds,
  date: string,
): boolean {
  if (bounds.from && date < bounds.from) return false;
  if (bounds.until && date > bounds.until) return false;
  return true;
}

function dateBoundsConfigured(bounds: CatalogueDateBounds | null): boolean {
  return Boolean(bounds && (bounds.from || bounds.until));
}

export function isCatalogueVoucherTypeApplicable(
  voucherType: LibraryVoucherType,
): boolean {
  return voucherType === "fixed_amount" || voucherType === "percentage";
}

export function isCatalogueVoucherCurrentlyValid(input: {
  status: CatalogueVoucherRecord["status"];
  validFrom: string | null;
  validUntil: string | null;
  today: string;
}): boolean {
  if (input.status !== "active") return false;
  if (input.validFrom && input.today < input.validFrom) return false;
  if (input.validUntil && input.today > input.validUntil) return false;
  return true;
}

export function isCatalogueVoucherDiscoverable(
  voucher: Pick<
    CatalogueVoucherRecord,
    "status" | "validFrom" | "validUntil" | "voucherType"
  >,
  today: string,
): boolean {
  return (
    isCatalogueVoucherTypeApplicable(voucher.voucherType) &&
    isCatalogueVoucherCurrentlyValid({
      status: voucher.status,
      validFrom: voucher.validFrom,
      validUntil: voucher.validUntil,
      today,
    })
  );
}

export function calculateCatalogueVoucherAmount(input: {
  voucherType: LibraryVoucherType;
  value: number;
  cakeSubtotal: number;
}): number | null {
  if (!isCatalogueVoucherTypeApplicable(input.voucherType)) {
    return null;
  }
  if (input.cakeSubtotal <= 0 || input.value <= 0) {
    return null;
  }
  if (input.voucherType === "fixed_amount") {
    const discount = Math.min(toCents(input.value), toCents(input.cakeSubtotal));
    return discount > 0 ? fromCents(-discount) : null;
  }
  const discount = Math.round((toCents(input.cakeSubtotal) * input.value) / 100);
  return discount > 0 ? fromCents(-discount) : null;
}

function itemMatchesSize(
  item: CatalogueOrderItem,
  sizeLabels: string[],
): boolean {
  if (sizeLabels.length === 0) return true;
  const itemLabel = normalizeCatalogueSizeLabel(item.sizeLabel);
  return sizeLabels.some(
    (label) => normalizeCatalogueSizeLabel(label) === itemLabel,
  );
}

function itemMatchesCake(item: CatalogueOrderItem, cakeIds: string[]): boolean {
  if (cakeIds.length === 0) return true;
  return cakeIds.includes(item.cakeId);
}

function qualifyingItemIndexes(
  items: CatalogueOrderItem[],
  rules: CatalogueVoucherRules,
): number[] {
  return items
    .map((item, index) =>
      itemMatchesCake(item, rules.cakeIds) &&
      itemMatchesSize(item, rules.sizeLabels)
        ? index
        : -1,
    )
    .filter((index) => index >= 0);
}

function pushCondition(
  list: CatalogueConditionResult[],
  condition: CatalogueConditionResult,
) {
  list.push(condition);
}

export function evaluateCatalogueVoucherEligibility(
  voucher: CatalogueVoucherRecord,
  input: CatalogueEligibilityInput,
): CatalogueEligibilityResult {
  const failed: CatalogueConditionResult[] = [];
  const passed: CatalogueConditionResult[] = [];
  const discoverable = isCatalogueVoucherDiscoverable(voucher, input.today);
  const cakeSubtotal = calculateCakeSubtotal(input.items);
  const amount = calculateCatalogueVoucherAmount({
    voucherType: voucher.voucherType,
    value: voucher.value,
    cakeSubtotal,
  });

  if (!isCatalogueVoucherTypeApplicable(voucher.voucherType)) {
    return {
      eligible: false,
      applicable: false,
      discoverable: false,
      amount: null,
      failedConditions: [
        {
          key: "type",
          label: "Voucher type",
          passed: false,
          detail: "Complimentary catalogue vouchers are not applied by this engine.",
        },
      ],
      passedConditions: [],
      qualifyingItemIndexes: [],
      reason: "Complimentary catalogue vouchers are not applied by this engine.",
    };
  }

  if (voucher.status !== "active") {
    const detail = `Voucher status is ${voucher.status}.`;
    return {
      eligible: false,
      applicable: false,
      discoverable: false,
      amount,
      failedConditions: [
        { key: "status", label: "Status", passed: false, detail },
      ],
      passedConditions: [],
      qualifyingItemIndexes: [],
      reason: detail,
    };
  }

  if (voucher.validFrom && input.today < voucher.validFrom) {
    const detail = `Voucher is not valid until ${voucher.validFrom}.`;
    return {
      eligible: false,
      applicable: false,
      discoverable: false,
      amount,
      failedConditions: [
        { key: "validity", label: "Validity", passed: false, detail },
      ],
      passedConditions: [],
      qualifyingItemIndexes: [],
      reason: detail,
    };
  }
  if (voucher.validUntil && input.today > voucher.validUntil) {
    const detail = `Voucher validity ended on ${voucher.validUntil}.`;
    return {
      eligible: false,
      applicable: false,
      discoverable: false,
      amount,
      failedConditions: [
        { key: "validity", label: "Validity", passed: false, detail },
      ],
      passedConditions: [],
      qualifyingItemIndexes: [],
      reason: detail,
    };
  }

  if (input.hasCatalogueVoucher) {
    const detail = "A catalogue voucher is already applied.";
    pushCondition(failed, {
      key: "stack_catalogue",
      label: "Stacking",
      passed: false,
      detail,
    });
    return {
      eligible: false,
      applicable: true,
      discoverable,
      amount,
      failedConditions: failed,
      passedConditions: passed,
      qualifyingItemIndexes: [],
      reason: detail,
    };
  }
  if (input.hasAugustPromo) {
    const detail = "Cannot stack with August Promo.";
    return {
      eligible: false,
      applicable: true,
      discoverable,
      amount,
      failedConditions: [
        { key: "stack_august", label: "Stacking", passed: false, detail },
      ],
      passedConditions: [],
      qualifyingItemIndexes: [],
      reason: detail,
    };
  }
  if (input.hasRm10Card) {
    const detail = "Cannot stack with an RM10 Discount Card.";
    return {
      eligible: false,
      applicable: true,
      discoverable,
      amount,
      failedConditions: [
        { key: "stack_rm10", label: "Stacking", passed: false, detail },
      ],
      passedConditions: [],
      qualifyingItemIndexes: [],
      reason: detail,
    };
  }

  if (dateBoundsConfigured(voucher.rules.orderDate)) {
    const ok = inclusiveDateContains(
      voucher.rules.orderDate as CatalogueDateBounds,
      input.orderDate,
    );
    const condition = {
      key: "order_date",
      label: "Order date",
      passed: ok,
      detail: ok
        ? `Order date ${input.orderDate} is within the configured window.`
        : `Order date ${input.orderDate} is outside the configured window.`,
    };
    pushCondition(ok ? passed : failed, condition);
  }

  if (dateBoundsConfigured(voucher.rules.fulfilmentDate)) {
    const ok = inclusiveDateContains(
      voucher.rules.fulfilmentDate as CatalogueDateBounds,
      input.fulfilmentDate,
    );
    const condition = {
      key: "fulfilment_date",
      label: "Fulfilment date",
      passed: ok,
      detail: ok
        ? `Fulfilment date ${input.fulfilmentDate} is within the configured window.`
        : `Fulfilment date ${input.fulfilmentDate} is outside the configured window.`,
    };
    pushCondition(ok ? passed : failed, condition);
  }

  if (
    voucher.rules.minimumCakeSubtotal != null &&
    Number.isFinite(voucher.rules.minimumCakeSubtotal)
  ) {
    const minimum = voucher.rules.minimumCakeSubtotal;
    const ok = moneyCompare(cakeSubtotal, minimum) >= 0;
    const condition = {
      key: "minimum_cake_subtotal",
      label: "Minimum cake subtotal",
      passed: ok,
      detail: ok
        ? `Cake subtotal ${cakeSubtotal.toFixed(2)} meets RM${minimum.toFixed(2)}.`
        : `Cake subtotal ${cakeSubtotal.toFixed(2)} is below RM${minimum.toFixed(2)}.`,
    };
    pushCondition(ok ? passed : failed, condition);
  }

  const needsLine =
    voucher.rules.cakeIds.length > 0 || voucher.rules.sizeLabels.length > 0;
  const qualifying = needsLine
    ? qualifyingItemIndexes(input.items, voucher.rules)
    : input.items.map((_, index) => index);

  if (needsLine) {
    const ok = qualifying.length > 0;
    const condition = {
      key: "cake_size_line",
      label: "Eligible cake / size",
      passed: ok,
      detail: ok
        ? "A cake line satisfies the configured cake and size rules."
        : "No cake line satisfies both the configured cake and size rules.",
    };
    pushCondition(ok ? passed : failed, condition);
  }

  const eligible = failed.length === 0 && amount != null;
  return {
    eligible,
    applicable: true,
    discoverable,
    amount: eligible ? amount : amount,
    failedConditions: failed,
    passedConditions: passed,
    qualifyingItemIndexes: eligible ? qualifying : qualifying,
    reason: eligible
      ? null
      : (failed[0]?.detail ?? "This voucher cannot be applied."),
  };
}

export function evaluateCatalogueVouchers(
  vouchers: CatalogueVoucherRecord[],
  input: CatalogueEligibilityInput,
): Array<{ voucher: CatalogueVoucherRecord; result: CatalogueEligibilityResult }> {
  return vouchers.map((voucher) => ({
    voucher,
    result: evaluateCatalogueVoucherEligibility(voucher, input),
  }));
}

export function summarizeCatalogueVoucherRules(
  voucher: CatalogueVoucherRecord,
): string[] {
  const lines: string[] = [];
  const order = voucher.rules.orderDate;
  if (dateBoundsConfigured(order)) {
    lines.push(
      `Order ${order?.from ?? "any"} – ${order?.until ?? "any"}`,
    );
  }
  const fulfilment = voucher.rules.fulfilmentDate;
  if (dateBoundsConfigured(fulfilment)) {
    lines.push(
      `Fulfilment ${fulfilment?.from ?? "any"} – ${fulfilment?.until ?? "any"}`,
    );
  }
  if (voucher.rules.minimumCakeSubtotal != null) {
    lines.push(`Minimum cake subtotal RM${voucher.rules.minimumCakeSubtotal}`);
  }
  if (voucher.rules.sizeLabels.length > 0) {
    lines.push(`Sizes ${voucher.rules.sizeLabels.join(", ")}`);
  }
  if (voucher.rules.cakeIds.length > 0) {
    lines.push(
      voucher.rules.cakeNames.length > 0
        ? `Cakes ${voucher.rules.cakeNames.join(", ")}`
        : "Selected cakes only",
    );
  }
  return lines;
}
