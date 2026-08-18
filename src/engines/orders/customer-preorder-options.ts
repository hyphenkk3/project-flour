/**
 * Customer Whole Cake preorder options — canonical complimentary / paid-card codes.
 * Prices come from paid_addon_types (via caller). Complimentary is always RM0.
 * Quantity on the public form is 0 or 1; Operations still supports card qty up to catalog max.
 */

import {
  paidAddonDraftsToMutationPayload,
  type EditablePaidAddonDraft,
  type PaidAddonMutationPayload,
} from "@/engines/orders/paid-addons";
import { calculateCommercialSubtotal } from "@/engines/orders/totals";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";

export const CUSTOMER_COMPLIMENTARY_CODES = [
  "birthday_topper",
  "candle",
  "knife",
] as const;

export const CUSTOMER_PAID_ADDON_CODES = [
  "birthday_card",
  "wishing_card",
] as const;

export const CUSTOMER_PAID_ADDON_QUANTITY = 1;

export type CustomerComplimentaryCode =
  (typeof CUSTOMER_COMPLIMENTARY_CODES)[number];
export type CustomerPaidAddonCode = (typeof CUSTOMER_PAID_ADDON_CODES)[number];

export type CustomerComplimentaryOption = {
  typeId: string;
  code: string;
  name: string;
  sortOrder: number;
};

export type CustomerPaidAddonOption = {
  code: string;
  name: string;
  unitPrice: number;
  financialShorthand: string;
  sortOrder: number;
};

export type CustomerPreorderSelections = {
  complimentaryCodes: string[];
  paidAddonCodes: string[];
  birthdayCardMessage: string;
  wishingCardMessage: string;
};

export type CustomerComplimentaryMutation = {
  type_id: string;
  code: string;
  name: string;
  quantity: number;
  sort_order: number;
};

export function emptyCustomerPreorderSelections(): CustomerPreorderSelections {
  return {
    complimentaryCodes: [],
    paidAddonCodes: [],
    birthdayCardMessage: "",
    wishingCardMessage: "",
  };
}

export function isCustomerComplimentaryCode(
  code: string,
): code is CustomerComplimentaryCode {
  return (CUSTOMER_COMPLIMENTARY_CODES as readonly string[]).includes(code);
}

export function isCustomerPaidAddonCode(
  code: string,
): code is CustomerPaidAddonCode {
  return (CUSTOMER_PAID_ADDON_CODES as readonly string[]).includes(code);
}

export function formatCustomerPreorderOptionLabel(
  name: string,
  unitPrice: number,
): string {
  return `${name} — ${formatRm(unitPrice)}`;
}

export function customerPaidAddonMessageVisible(
  code: CustomerPaidAddonCode,
  selectedCodes: readonly string[],
): boolean {
  return selectedCodes.includes(code);
}

/** Public card messages are optional even when the card is selected. */
export function customerPaidAddonMessageRequired(
  _code: CustomerPaidAddonCode,
  _selectedCodes: readonly string[],
): boolean {
  return false;
}

export function selectCustomerComplimentaryOptions(
  options: readonly CustomerComplimentaryOption[],
): CustomerComplimentaryOption[] {
  const rank = new Map(
    CUSTOMER_COMPLIMENTARY_CODES.map((code, index) => [code, index]),
  );
  return options
    .filter((option) => isCustomerComplimentaryCode(option.code) && option.typeId)
    .sort(
      (a, b) =>
        (rank.get(a.code as CustomerComplimentaryCode) ?? 99) -
          (rank.get(b.code as CustomerComplimentaryCode) ?? 99) ||
        a.sortOrder - b.sortOrder,
    );
}

export function selectCustomerPaidAddonOptions(
  options: readonly CustomerPaidAddonOption[],
): CustomerPaidAddonOption[] {
  const rank = new Map(
    CUSTOMER_PAID_ADDON_CODES.map((code, index) => [code, index]),
  );
  return options
    .filter(
      (option) =>
        isCustomerPaidAddonCode(option.code) && Number(option.unitPrice) >= 0,
    )
    .sort(
      (a, b) =>
        (rank.get(a.code as CustomerPaidAddonCode) ?? 99) -
          (rank.get(b.code as CustomerPaidAddonCode) ?? 99) ||
        a.sortOrder - b.sortOrder,
    );
}

export function selectedCustomerComplimentaryCodes(
  selected: readonly string[],
  options: readonly CustomerComplimentaryOption[],
): string[] {
  const allowed = new Set(
    selectCustomerComplimentaryOptions(options).map((option) => option.code),
  );
  return selected.filter((code) => allowed.has(code));
}

export function selectedCustomerPaidAddonCodes(
  selected: readonly string[],
  options: readonly CustomerPaidAddonOption[],
): string[] {
  const allowed = new Set(
    selectCustomerPaidAddonOptions(options).map((option) => option.code),
  );
  return selected.filter((code) => allowed.has(code));
}

function messageForCode(
  code: string,
  selections: Pick<
    CustomerPreorderSelections,
    "birthdayCardMessage" | "wishingCardMessage"
  >,
): string {
  if (code === "birthday_card") return selections.birthdayCardMessage;
  if (code === "wishing_card") return selections.wishingCardMessage;
  return "";
}

export function customerComplimentaryMutationPayload(input: {
  options: readonly CustomerComplimentaryOption[];
  selectedCodes: readonly string[];
}): CustomerComplimentaryMutation[] {
  const selected = new Set(
    selectedCustomerComplimentaryCodes(input.selectedCodes, input.options),
  );
  return selectCustomerComplimentaryOptions(input.options)
    .filter((option) => selected.has(option.code))
    .map((option) => ({
      type_id: option.typeId,
      code: option.code,
      name: option.name,
      quantity: 1,
      sort_order: option.sortOrder,
    }));
}

export function customerPaidAddonMutationPayload(input: {
  options: readonly CustomerPaidAddonOption[];
  selections: CustomerPreorderSelections;
}): PaidAddonMutationPayload[] {
  const selected = selectedCustomerPaidAddonCodes(
    input.selections.paidAddonCodes,
    input.options,
  );
  const drafts: EditablePaidAddonDraft[] = selectCustomerPaidAddonOptions(
    input.options,
  )
    .filter((option) => selected.includes(option.code))
    .map((option, index) => ({
      code: option.code,
      name: option.name,
      catalogUnitPrice: option.unitPrice,
      snapshotUnitPrice: option.unitPrice,
      selected: true,
      quantity: CUSTOMER_PAID_ADDON_QUANTITY,
      maxQuantity: CUSTOMER_PAID_ADDON_QUANTITY,
      writtenMessages: [messageForCode(option.code, input.selections)],
      sortOrder: option.sortOrder ?? index,
    }));
  return paidAddonDraftsToMutationPayload(drafts);
}

export function customerPaidAddonLinesForTotal(input: {
  options: readonly CustomerPaidAddonOption[];
  selectedCodes: readonly string[];
}): Array<{ unitPrice: number; quantity: number }> {
  const selected = new Set(
    selectedCustomerPaidAddonCodes(input.selectedCodes, input.options),
  );
  return selectCustomerPaidAddonOptions(input.options)
    .filter((option) => selected.has(option.code))
    .map((option) => ({
      unitPrice: Number(option.unitPrice),
      quantity: CUSTOMER_PAID_ADDON_QUANTITY,
    }));
}

export function customerPreorderCommercialTotal(input: {
  items: Array<{ unitPrice: number; quantity: number }>;
  options: readonly CustomerPaidAddonOption[];
  selectedCodes: readonly string[];
}): number {
  return calculateCommercialSubtotal({
    items: input.items,
    paidAddons: customerPaidAddonLinesForTotal({
      options: input.options,
      selectedCodes: input.selectedCodes,
    }),
  });
}
