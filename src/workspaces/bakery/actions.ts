"use server";

import { requireStaff } from "@/foundation/auth/session";
import { canAccessBakeryWorkspace } from "@/engines/bakery/capabilities";
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
