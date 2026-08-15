"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/foundation/auth/session";
import {
  buildCollectionWorkspaceCapabilities,
  canAccessCollectionWorkspace,
} from "@/engines/collection/capabilities";
import { createClient } from "@/lib/supabase/server";
import {
  isCollectionMarkCollectedEligible,
  isCollectionUndoCollectedEligible,
} from "@/workspaces/collection/eligibility";
import {
  getCollectionBoardOrderById,
  getCollectionOrderDetail,
  listCollectionBoardOrders,
  listCollectionOrdersForTab,
} from "@/workspaces/collection/queries";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";
import type { CollectionBoardTab } from "@/workspaces/collection/eligibility";

async function requireCollectionStaff() {
  const staff = await requireStaff();
  if (!canAccessCollectionWorkspace(staff.role.code)) {
    throw new Error("Collection workspace is not available for this role.");
  }
  return staff;
}

export async function listCollectionBoardOrdersAction(
  selectedPickupDate: string,
): Promise<CollectionBoardOrder[]> {
  await requireCollectionStaff();
  return listCollectionBoardOrders(selectedPickupDate);
}

export async function listCollectionOrdersForTabAction(
  tab: CollectionBoardTab,
  selectedPickupDate: string,
): Promise<CollectionBoardOrder[]> {
  await requireCollectionStaff();
  return listCollectionOrdersForTab(tab, selectedPickupDate);
}

export async function getCollectionBoardOrderAction(
  orderId: string,
  selectedPickupDate: string,
  tab: CollectionBoardTab = "ready",
): Promise<CollectionBoardOrder | null> {
  await requireCollectionStaff();
  return getCollectionBoardOrderById(orderId, selectedPickupDate, tab);
}

export async function markCollectionOrderCollectedAction(
  orderId: string,
): Promise<{ error: string | null }> {
  const staff = await requireCollectionStaff();
  const caps = buildCollectionWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canMarkCollected) {
    return { error: "Not authorized to mark collected." };
  }

  const supabase = await createClient();
  const { data: row, error: loadError } = await supabase
    .from("orders")
    .select(
      "id, ready_at, picked_up_at, fulfilment_method, status, customer_id",
    )
    .eq("id", orderId)
    .is("customer_id", null)
    .maybeSingle();

  if (loadError) {
    return { error: loadError.message };
  }
  if (!row) {
    return { error: "Order not found." };
  }

  if (
    !isCollectionMarkCollectedEligible({
      readyAt: row.ready_at,
      pickedUpAt: row.picked_up_at,
      fulfilmentMethod: row.fulfilment_method,
      status: row.status,
    })
  ) {
    return {
      error:
        "Only Ready pickup orders can be marked collected in Collection.",
    };
  }

  const { error } = await supabase.rpc("mark_guest_order_picked_up", {
    p_order_id: orderId,
    p_actor_staff_id: staff.id,
  });

  if (error) {
    return { error: error.message };
  }
  revalidatePath("/collection");
  revalidatePath(`/collection/orders/${orderId}`);
  revalidatePath("/bakery");
  return { error: null };
}

export async function undoCollectionOrderCollectedAction(
  orderId: string,
): Promise<{ error: string | null }> {
  const staff = await requireCollectionStaff();
  const caps = buildCollectionWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!caps.canUndoCollected) {
    return { error: "Not authorized to undo collected." };
  }

  const supabase = await createClient();
  const { data: row, error: loadError } = await supabase
    .from("orders")
    .select("id, picked_up_at, fulfilment_method, customer_id")
    .eq("id", orderId)
    .is("customer_id", null)
    .maybeSingle();

  if (loadError) {
    return { error: loadError.message };
  }
  if (!row) {
    return { error: "Order not found." };
  }

  if (
    !isCollectionUndoCollectedEligible({
      pickedUpAt: row.picked_up_at,
      fulfilmentMethod: row.fulfilment_method,
    })
  ) {
    return { error: "Order is not collected." };
  }

  const { error } = await supabase.rpc("undo_guest_order_picked_up", {
    p_order_id: orderId,
    p_actor_staff_id: staff.id,
  });

  if (error) {
    return { error: error.message };
  }
  revalidatePath("/collection");
  revalidatePath(`/collection/orders/${orderId}`);
  revalidatePath("/bakery");
  return { error: null };
}

export async function getCollectionOrderDetailAction(
  orderId: string,
  selectedPickupDate: string,
): Promise<CollectionBoardOrder | null> {
  await requireCollectionStaff();
  return getCollectionOrderDetail(orderId, selectedPickupDate);
}
