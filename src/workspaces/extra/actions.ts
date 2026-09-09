"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessBakeryWorkspace } from "@/engines/bakery/capabilities";
import { buildExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";
import { evaluateExtraConfirm } from "@/engines/extra/fresh-picks-eligibility";
import { normalizeExtraRejectReason } from "@/engines/extra/reject-reason";
import { toBusinessDateKey } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import {
  findAssignableOrderForExtra,
  listExtraCakeOptions,
  listExtraStockUnits,
  type ExtraAssignableOrder,
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
  revalidatePath("/extra");
  revalidatePath("/extra", "layout");
  revalidatePath("/");
  revalidatePath("/owner/calendar");
}

function evaluateFreshPickConfirm(input: {
  pickupFromDate: string;
  pickupFromSlot: string;
  cutoffDate: string;
  cutoffSlot: string;
}) {
  return evaluateExtraConfirm({
    pickupFromDate: input.pickupFromDate,
    pickupFromSlot: input.pickupFromSlot,
    cutoffDate: input.cutoffDate,
    cutoffSlot: input.cutoffSlot,
    todayYmd: toBusinessDateKey(),
    now: new Date(),
  });
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
  pickupFromDate: string;
  pickupFromSlot: string;
  cutoffDate: string;
  cutoffSlot: string;
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

  const window = evaluateFreshPickConfirm({
    pickupFromDate: input.pickupFromDate,
    pickupFromSlot: input.pickupFromSlot,
    cutoffDate: input.cutoffDate,
    cutoffSlot: input.cutoffSlot,
  });
  if (!window.ok) {
    return { error: window.error };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_confirmed_extra_stock", {
    p_actor_staff_id: staff.id,
    p_cake_name: input.cakeName,
    p_size_label: input.sizeLabel,
    p_prepared_on: window.preparedOn,
    p_pickup_available_from_at: window.pickupAvailableFromIso,
    p_pickup_through_at: window.orderCutoffIso,
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
  pickupFromDate: string;
  pickupFromSlot: string;
  cutoffDate: string;
  cutoffSlot: string;
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

  const window = evaluateFreshPickConfirm({
    pickupFromDate: input.pickupFromDate,
    pickupFromSlot: input.pickupFromSlot,
    cutoffDate: input.cutoffDate,
    cutoffSlot: input.cutoffSlot,
  });
  if (!window.ok) {
    return { error: window.error };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_extra_stock", {
    p_extra_stock_id: input.extraStockId,
    p_actor_staff_id: staff.id,
    p_prepared_on: window.preparedOn,
    p_pickup_available_from_at: window.pickupAvailableFromIso,
    p_pickup_through_at: window.orderCutoffIso,
    p_note: input.note?.trim() || null,
  });

  if (error) {
    return { error: error.message };
  }
  revalidateExtraPaths();
  return { error: null };
}

export async function unconfirmExtraStockAction(
  extraStockId: string,
): Promise<{ error: string | null }> {
  const staff = await requireExtraStaff();
  const caps = buildExtraWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canUnconfirmExtra) {
    return { error: "Not authorized to undo EXTRA availability." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("unconfirm_extra_stock", {
    p_extra_stock_id: extraStockId,
    p_actor_staff_id: staff.id,
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

export async function findAssignableOrderForExtraAction(
  query: string,
): Promise<{ order: ExtraAssignableOrder | null; error: string | null }> {
  const staff = await requireExtraStaff();
  const caps = buildExtraWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canAssignExtraToOrder) {
    return { order: null, error: "Not authorized to assign EXTRA." };
  }
  try {
    const order = await findAssignableOrderForExtra(query);
    return { order, error: null };
  } catch (error) {
    return {
      order: null,
      error:
        error instanceof Error ? error.message : "Could not find that order.",
    };
  }
}

export async function assignExtraStockToOrderAction(input: {
  extraStockId: string;
  orderId: string;
}): Promise<{ error: string | null }> {
  const staff = await requireExtraStaff();
  const caps = buildExtraWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canAssignExtraToOrder) {
    return { error: "Not authorized to assign EXTRA." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_extra_stock_to_order", {
    p_extra_stock_id: input.extraStockId,
    p_order_id: input.orderId,
    p_actor_staff_id: staff.id,
  });
  if (error) {
    return { error: error.message };
  }
  revalidateExtraPaths();
  return { error: null };
}

export type MoveExtraWindowInput = {
  extraStockId: string;
  pickupFromDate: string;
  pickupFromSlot: string;
  cutoffDate: string;
  cutoffSlot: string;
};

export async function moveExtraStockWindowAction(
  input: MoveExtraWindowInput,
): Promise<{ error: string | null }> {
  const staff = await requireExtraStaff();
  const caps = buildExtraWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canMoveExtraWindow) {
    return { error: "Not authorized to move EXTRA." };
  }

  const window = evaluateFreshPickConfirm({
    pickupFromDate: input.pickupFromDate,
    pickupFromSlot: input.pickupFromSlot,
    cutoffDate: input.cutoffDate,
    cutoffSlot: input.cutoffSlot,
  });
  if (!window.ok) {
    return { error: window.error };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("move_extra_stock_fresh_pick_window", {
    p_extra_stock_id: input.extraStockId,
    p_actor_staff_id: staff.id,
    p_prepared_on: window.preparedOn,
    p_pickup_available_from_at: window.pickupAvailableFromIso,
    p_pickup_through_at: window.orderCutoffIso,
  });
  if (error) {
    return { error: error.message };
  }
  revalidateExtraPaths();
  return { error: null };
}

export async function cutExtraStockIntoSlicesAction(
  extraStockId: string,
): Promise<{ error: string | null }> {
  const staff = await requireExtraStaff();
  const caps = buildExtraWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canCutExtraIntoSlices) {
    return { error: "Not authorized to cut EXTRA into slices." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cut_extra_stock_into_slices", {
    p_extra_stock_id: extraStockId,
    p_actor_staff_id: staff.id,
  });
  if (error) {
    return { error: error.message };
  }
  revalidateExtraPaths();
  return { error: null };
}
