"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/foundation/auth/session";
import {
  buildBakeryWorkspaceCapabilities,
  canAccessBakeryWorkspace,
} from "@/engines/bakery/capabilities";
import { createClient } from "@/lib/supabase/server";
import {
  getBakeryBoardOrderById,
  listBakeryBoardOrders,
} from "@/workspaces/bakery/queries";
import type { BakeryBoardOrder } from "@/workspaces/bakery/types";

async function requireBakeryStaff() {
  const staff = await requireStaff();
  if (!canAccessBakeryWorkspace(staff.role.code)) {
    throw new Error("Bakery workspace is not available for this role.");
  }
  return staff;
}

export async function listBakeryBoardOrdersAction(
  selectedPickupDate: string,
): Promise<BakeryBoardOrder[]> {
  await requireBakeryStaff();
  return listBakeryBoardOrders(selectedPickupDate);
}

export async function getBakeryBoardOrderAction(
  orderId: string,
  selectedPickupDate: string,
): Promise<BakeryBoardOrder | null> {
  await requireBakeryStaff();
  return getBakeryBoardOrderById(orderId, selectedPickupDate);
}

export async function startBakeryProductionAction(
  orderId: string,
): Promise<{ error: string | null }> {
  const staff = await requireBakeryStaff();
  const caps = buildBakeryWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canStartProduction) {
    return { error: "Not authorized to start production." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_guest_order_production_started", {
    p_order_id: orderId,
    p_actor_staff_id: staff.id,
  });

  if (error) {
    return { error: error.message };
  }
  revalidatePath("/bakery");
  revalidatePath(`/bakery/orders/${orderId}`);
  return { error: null };
}

export async function undoBakeryProductionStartAction(
  orderId: string,
): Promise<{ error: string | null }> {
  const staff = await requireBakeryStaff();
  const caps = buildBakeryWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canUndoStart) {
    return { error: "Not authorized to undo start production." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_guest_order_production_started", {
    p_order_id: orderId,
    p_actor_staff_id: staff.id,
  });

  if (error) {
    return { error: error.message };
  }
  revalidatePath("/bakery");
  revalidatePath(`/bakery/orders/${orderId}`);
  return { error: null };
}

export async function markBakeryOrderReadyAction(
  orderId: string,
): Promise<{ error: string | null }> {
  const staff = await requireBakeryStaff();
  const caps = buildBakeryWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canMarkReady) {
    return { error: "Not authorized to mark ready." };
  }

  const supabase = await createClient();
  const { data: row, error: loadError } = await supabase
    .from("orders")
    .select(
      "id, customer_id, status, production_started_at, ready_at, picked_up_at, out_for_delivery_at, delivered_at",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (loadError) {
    return { error: loadError.message };
  }
  if (!row || row.customer_id != null) {
    return { error: "Order not found." };
  }
  if (!row.production_started_at) {
    return {
      error: "Start production before marking this order Ready.",
    };
  }
  if (row.ready_at) {
    return { error: "Order is already marked ready." };
  }

  const { error } = await supabase.rpc("mark_guest_order_ready", {
    p_order_id: orderId,
    p_actor_staff_id: staff.id,
  });

  if (error) {
    return { error: error.message };
  }
  revalidatePath("/bakery");
  revalidatePath(`/bakery/orders/${orderId}`);
  return { error: null };
}

export async function undoBakeryOrderReadyAction(
  orderId: string,
): Promise<{ error: string | null }> {
  const staff = await requireBakeryStaff();
  const caps = buildBakeryWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canUndoReady) {
    return { error: "Not authorized to undo ready." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_guest_order_ready", {
    p_order_id: orderId,
    p_actor_staff_id: staff.id,
  });

  if (error) {
    return { error: error.message };
  }
  revalidatePath("/bakery");
  revalidatePath(`/bakery/orders/${orderId}`);
  return { error: null };
}
