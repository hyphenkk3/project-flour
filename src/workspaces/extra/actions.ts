"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessBakeryWorkspace } from "@/engines/bakery/capabilities";
import { buildExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";
import { normalizeExtraRejectReason } from "@/engines/extra/reject-reason";
import { createClient } from "@/lib/supabase/server";
import {
  listExtraCakeOptions,
  listExtraStockUnits,
} from "@/workspaces/extra/queries";
import type { ExtraCakeOption, ExtraStockUnit } from "@/workspaces/extra/types";

async function requireExtraStaff() {
  const staff = await requireStaff();
  if (!canAccessBakeryWorkspace(staff.role.code)) {
    throw new Error("Bakery EXTRA is not available for this role.");
  }
  return staff;
}

function revalidateExtraPaths() {
  revalidatePath("/bakery");
  revalidatePath("/bakery/extra");
  // Calendar shows EXTRA by prepared_on — keep Owner Matrix in sync after propose.
  revalidatePath("/owner/calendar");
}
export async function listExtraStockUnitsAction(): Promise<ExtraStockUnit[]> {
  await requireExtraStaff();
  return listExtraStockUnits();
}

export async function listExtraCakeOptionsAction(): Promise<ExtraCakeOption[]> {
  await requireExtraStaff();
  return listExtraCakeOptions();
}

export type ProposeExtraInput = {
  cakeName: string;
  sizeLabel: string;
  preparedOn?: string | null;
  note?: string | null;
  libraryCakeId?: string | null;
  libraryCakeSizeId?: string | null;
};

export async function proposeExtraStockAction(
  input: ProposeExtraInput,
): Promise<{ error: string | null }> {
  const staff = await requireExtraStaff();
  const caps = buildExtraWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canProposeExtra) {
    return { error: "Not authorized to propose EXTRA." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("propose_extra_stock", {
    p_actor_staff_id: staff.id,
    p_cake_name: input.cakeName,
    p_size_label: input.sizeLabel,
    p_prepared_on: input.preparedOn?.trim() || null,
    p_note: input.note?.trim() || null,
    p_library_cake_id: input.libraryCakeId || null,
    p_library_cake_size_id: input.libraryCakeSizeId || null,
  });

  if (error) {
    return { error: error.message };
  }
  revalidateExtraPaths();
  return { error: null };
}

export type CreateConfirmedExtraInput = {
  cakeName: string;
  sizeLabel: string;
  preparedOn: string;
  pickupThroughAt: string;
  note?: string | null;
  libraryCakeId?: string | null;
  libraryCakeSizeId?: string | null;
};

export async function createConfirmedExtraStockAction(
  input: CreateConfirmedExtraInput,
): Promise<{ error: string | null }> {
  const staff = await requireExtraStaff();
  const caps = buildExtraWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canCreateConfirmedExtra) {
    return { error: "Not authorized to create confirmed EXTRA." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_confirmed_extra_stock", {
    p_actor_staff_id: staff.id,
    p_cake_name: input.cakeName,
    p_size_label: input.sizeLabel,
    p_prepared_on: input.preparedOn,
    p_pickup_through_at: input.pickupThroughAt,
    p_note: input.note?.trim() || null,
    p_library_cake_id: input.libraryCakeId || null,
    p_library_cake_size_id: input.libraryCakeSizeId || null,
  });

  if (error) {
    return { error: error.message };
  }
  revalidateExtraPaths();
  return { error: null };
}

export type ConfirmExtraInput = {
  extraStockId: string;
  preparedOn: string;
  pickupThroughAt: string;
  note?: string | null;
};

export async function confirmExtraStockAction(
  input: ConfirmExtraInput,
): Promise<{ error: string | null }> {
  const staff = await requireExtraStaff();
  const caps = buildExtraWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canConfirmExtra) {
    return { error: "Not authorized to confirm EXTRA." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_extra_stock", {
    p_extra_stock_id: input.extraStockId,
    p_actor_staff_id: staff.id,
    p_prepared_on: input.preparedOn,
    p_pickup_through_at: input.pickupThroughAt,
    p_note: input.note?.trim() || null,
  });

  if (error) {
    return { error: error.message };
  }
  revalidateExtraPaths();
  return { error: null };
}

export async function rejectExtraStockAction(
  extraStockId: string,
  rejectReason?: string | null,
): Promise<{ error: string | null }> {
  const staff = await requireExtraStaff();
  const caps = buildExtraWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canRejectExtra) {
    return { error: "Not authorized to reject EXTRA." };
  }

  const reason = normalizeExtraRejectReason(rejectReason);
  if (!reason) {
    return { error: "A rejection reason is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_extra_stock", {
    p_extra_stock_id: extraStockId,
    p_actor_staff_id: staff.id,
    p_reject_reason: reason,
  });

  if (error) {
    return { error: error.message };
  }
  revalidateExtraPaths();
  return { error: null };
}

export async function undoRejectExtraStockAction(
  extraStockId: string,
): Promise<{ error: string | null }> {
  const staff = await requireExtraStaff();
  const caps = buildExtraWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canUndoRejectExtra) {
    return { error: "Not authorized to undo EXTRA rejection." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_extra_stock_rejected", {
    p_extra_stock_id: extraStockId,
    p_actor_staff_id: staff.id,
  });

  if (error) {
    return { error: error.message };
  }
  revalidateExtraPaths();
  return { error: null };
}
