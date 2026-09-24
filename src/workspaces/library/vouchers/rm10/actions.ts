"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canManageRm10PhysicalCards } from "@/foundation/navigation/access";
import {
  formatAlreadyExistMessage,
  parseRequiredExpiryDate,
  parseSingleVoucherNumber,
  parseVoucherNumberList,
  parseVoucherNumberRange,
  planRm10PhysicalVoucherInserts,
  RM10_EXPIRY_REQUIRED,
  RM10_UNAUTHORIZED,
} from "@/engines/vouchers/physical-rm10";
import { createClient } from "@/lib/supabase/server";
import { listExistingRm10NormalizedNumbers } from "@/workspaces/library/vouchers/rm10/queries";

export type Rm10LibraryActionState = {
  error: string | null;
  createdCount: number;
  existingNumbers: string[];
};

export const rm10LibraryActionInitialState: Rm10LibraryActionState = {
  error: null,
  createdCount: 0,
  existingNumbers: [],
};

async function requireRm10LibraryStaff() {
  const staff = await requireStaff();
  if (!canManageRm10PhysicalCards(staff.role.code)) {
    redirect("/home");
  }
  return staff;
}

function parseRequestedNumbers(
  formData: FormData,
): { voucherNumber: string; normalized: string }[] | string {
  const method = String(formData.get("add_method") ?? "single").trim();

  if (method === "range") {
    return parseVoucherNumberRange(
      formData.get("start_number"),
      formData.get("end_number"),
    );
  }
  if (method === "list") {
    return parseVoucherNumberList(formData.get("voucher_list"));
  }
  return (() => {
    const parsed = parseSingleVoucherNumber(formData.get("voucher_number"));
    return typeof parsed === "string" ? parsed : [parsed];
  })();
}

export async function addRm10PhysicalVouchersAction(
  _prev: Rm10LibraryActionState,
  formData: FormData,
): Promise<Rm10LibraryActionState> {
  const staff = await requireRm10LibraryStaff();

  const expiryDate = parseRequiredExpiryDate(formData.get("expiry_date"));
  if (!expiryDate) {
    return {
      error: RM10_EXPIRY_REQUIRED,
      createdCount: 0,
      existingNumbers: [],
    };
  }

  const requested = parseRequestedNumbers(formData);
  if (typeof requested === "string") {
    return { error: requested, createdCount: 0, existingNumbers: [] };
  }

  let existingNormalized: string[];
  try {
    existingNormalized = await listExistingRm10NormalizedNumbers(
      requested.map((item) => item.normalized),
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : RM10_UNAUTHORIZED,
      createdCount: 0,
      existingNumbers: [],
    };
  }

  const plan = planRm10PhysicalVoucherInserts(requested, existingNormalized);

  if (plan.toCreate.length === 0) {
    return {
      error: formatAlreadyExistMessage(plan.alreadyExist),
      createdCount: 0,
      existingNumbers: plan.alreadyExist,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("physical_discount_vouchers").insert(
    plan.toCreate.map((item) => ({
      voucher_number: item.voucherNumber,
      voucher_number_normalized: item.normalized,
      expiry_date: expiryDate,
      status: "unredeemed",
      library_managed: true,
      created_by: staff.id,
    })),
  );

  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "One or more voucher numbers already exist. Existing records were not changed.",
        createdCount: 0,
        existingNumbers: plan.alreadyExist,
      };
    }
    return {
      error: error.message,
      createdCount: 0,
      existingNumbers: [],
    };
  }

  revalidatePath("/library/vouchers");
  revalidatePath("/library/vouchers/rm10");

  if (plan.alreadyExist.length > 0) {
    return {
      error: null,
      createdCount: plan.toCreate.length,
      existingNumbers: plan.alreadyExist,
    };
  }

  redirect("/library/vouchers/rm10");
}
