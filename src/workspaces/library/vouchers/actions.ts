"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { createClient } from "@/lib/supabase/server";
import type {
  LibraryVoucherInput,
  LibraryVoucherStatus,
  LibraryVoucherType,
} from "@/types/library-voucher";
import type { LibraryActionState } from "@/workspaces/library/action-state";
import { listCakes } from "@/workspaces/library/cakes/queries";
import {
  emptyToNull,
  LIBRARY_VOUCHER_STATUSES,
  LIBRARY_VOUCHER_TYPES,
  parseNonNegativeNumber,
  parseOptionalDate,
} from "@/workspaces/library/labels";
import { replaceLibraryVoucherRules } from "@/workspaces/library/vouchers/rule-queries";
import { parseCatalogueRulesFromForm } from "@/workspaces/library/vouchers/rules";
import {
  COMMON_CATALOGUE_SIZE_LABELS,
  normalizeCatalogueSizeLabel,
} from "@/engines/vouchers/catalogue-voucher";

async function requireLibraryStaff() {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }
  return staff;
}

function parseVoucherInput(formData: FormData): LibraryVoucherInput | string {
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  const voucherType = String(
    formData.get("voucher_type") ?? "",
  ).trim() as LibraryVoucherType;
  const value = parseNonNegativeNumber(formData.get("value"));
  const validFrom = parseOptionalDate(formData.get("valid_from"));
  const validUntil = parseOptionalDate(formData.get("valid_until"));
  const imageUrl = emptyToNull(formData.get("image_url"));
  const assetId = emptyToNull(formData.get("asset_id"));
  const status = String(
    formData.get("status") ?? "",
  ).trim() as LibraryVoucherStatus;
  const rawLimit = String(formData.get("redemption_limit") ?? "").trim();
  let redemptionLimit: number | null = null;
  if (rawLimit) {
    const parsedLimit = Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      return "Redemption limit must be a whole number of 1 or more, or left blank for unlimited.";
    }
    redemptionLimit = parsedLimit;
  }

  if (!code) return "Voucher code is required.";
  if (!LIBRARY_VOUCHER_TYPES.includes(voucherType)) {
    return "Choose a valid voucher type.";
  }
  if (!LIBRARY_VOUCHER_STATUSES.includes(status)) {
    return "Choose a valid status.";
  }
  if (voucherType === "percentage" && value > 100) {
    return "Percentage value cannot exceed 100.";
  }
  if (validFrom && validUntil && validUntil < validFrom) {
    return "Valid until must be on or after valid from.";
  }

  return {
    code,
    voucherType,
    value,
    validFrom,
    validUntil,
    imageUrl,
    assetId,
    status,
    redemptionLimit,
  };
}

async function knownEligibilityOptions() {
  const cakes = await listCakes();
  const sizeLabels = new Set<string>(COMMON_CATALOGUE_SIZE_LABELS);
  for (const cake of cakes) {
    for (const size of cake.sizes ?? []) {
      const label = size.label?.trim();
      if (label) sizeLabels.add(label);
    }
  }
  return {
    cakeIds: new Set(cakes.map((cake) => cake.id)),
    sizeLabels: Array.from(sizeLabels).filter(
      (label) => normalizeCatalogueSizeLabel(label) != null,
    ),
  };
}

export async function createVoucherAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const staff = await requireLibraryStaff();
  const parsed = parseVoucherInput(formData);
  if (typeof parsed === "string") {
    return { error: parsed };
  }

  const options = await knownEligibilityOptions();
  const rules = parseCatalogueRulesFromForm(
    formData,
    options.cakeIds,
    options.sizeLabels,
  );
  if (typeof rules === "string") {
    return { error: rules };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_vouchers")
    .insert({
      code: parsed.code,
      voucher_type: parsed.voucherType,
      value: parsed.value,
      valid_from: parsed.validFrom,
      valid_until: parsed.validUntil,
      image_url: parsed.imageUrl,
      asset_id: parsed.assetId,
      status: parsed.status,
      redemption_limit: parsed.redemptionLimit,
      created_by: staff.id,
      updated_by: staff.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "That voucher code already exists." };
    }
    return { error: error.message };
  }

  try {
    await replaceLibraryVoucherRules(supabase, data.id, rules);
  } catch (ruleError) {
    return {
      error:
        ruleError instanceof Error
          ? ruleError.message
          : "Voucher saved but eligibility rules could not be stored.",
    };
  }

  revalidatePath("/library/vouchers");
  redirect(`/library/vouchers/${data.id}`);
}

export async function updateVoucherAction(
  id: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const staff = await requireLibraryStaff();
  const parsed = parseVoucherInput(formData);
  if (typeof parsed === "string") {
    return { error: parsed };
  }

  const options = await knownEligibilityOptions();
  const rules = parseCatalogueRulesFromForm(
    formData,
    options.cakeIds,
    options.sizeLabels,
  );
  if (typeof rules === "string") {
    return { error: rules };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("library_vouchers")
    .update({
      code: parsed.code,
      voucher_type: parsed.voucherType,
      value: parsed.value,
      valid_from: parsed.validFrom,
      valid_until: parsed.validUntil,
      image_url: parsed.imageUrl,
      asset_id: parsed.assetId,
      status: parsed.status,
      redemption_limit: parsed.redemptionLimit,
      updated_by: staff.id,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "That voucher code already exists." };
    }
    return { error: error.message };
  }

  try {
    await replaceLibraryVoucherRules(supabase, id, rules);
  } catch (ruleError) {
    return {
      error:
        ruleError instanceof Error
          ? ruleError.message
          : "Voucher saved but eligibility rules could not be stored.",
    };
  }

  revalidatePath("/library/vouchers");
  revalidatePath(`/library/vouchers/${id}`);
  revalidatePath(`/library/vouchers/${id}/edit`);
  redirect(`/library/vouchers/${id}`);
}

export async function deleteVoucherAction(id: string): Promise<void> {
  await requireLibraryStaff();
  const supabase = await createClient();
  const { error } = await supabase
    .from("library_vouchers")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/library/vouchers");
  redirect("/library/vouchers");
}
