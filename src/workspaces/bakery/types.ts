/**
 * M5-P1 — slim Bakery production read model (not Owner Order Workspace DTO).
 */

import type {
  GuestOrderStatus,
  StorefrontOrderFulfilmentMethod,
} from "@/types/storefront";
import type { BakeryAllocationSummary } from "@/engines/bakery/fresh-pick-allocation";

/** P2 production presentation — Ready wins when both Start and Ready exist. */
export type BakeryProductionPresentation =
  | "not_started"
  | "in_production"
  | "ready";

export type BakeryCakeLine = {
  id: string;
  cakeName: string;
  sizeLabel: string;
  quantity: number;
  cakeId: string | null;
  sizeId: string | null;
};

export type BakeryComplimentaryLine = {
  id: string;
  name: string;
  quantity: number;
  sortOrder: number;
};

export type BakeryPaidAddonMessage = {
  cardIndex: number;
  writtenMessage: string | null;
};

export type BakeryPaidAddonLine = {
  id: string;
  code: string;
  name: string;
  quantity: number;
  sortOrder: number;
  messages: BakeryPaidAddonMessage[];
};

export type BakeryAssignedFreshPickStock = {
  id: string;
  cakeName: string;
  sizeLabel: string;
  lifecycle: string;
  soldAt: string | null;
  cutIntoSlicesAt: string | null;
  readyForCollection: boolean;
  legacyLinkConflict: boolean;
};

/** Board card + shared identity for list rows. */
export type BakeryBoardOrder = {
  id: string;
  orderNumber: string;
  guestName: string;
  pickupDate: string;
  pickupTime: string;
  fulfilmentMethod: StorefrontOrderFulfilmentMethod;
  status: GuestOrderStatus;
  customerNotes: string | null;
  needsBakeryAttention: boolean;
  bakeryAttentionNote: string | null;
  productionStartedAt: string | null;
  productionStartedBy: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  includeReceipt: boolean;
  cakeLines: BakeryCakeLine[];
  freshPickAllocation: BakeryAllocationSummary;
  assignedFreshPickStocks: BakeryAssignedFreshPickStock[];
  complimentaryItems: BakeryComplimentaryLine[];
  paidAddons: BakeryPaidAddonLine[];
};

/** Detail adds nothing structural beyond board row; packing derived in helpers. */
export type BakeryOrderDetail = BakeryBoardOrder;

export type BakeryPackingReminderItem = {
  key: string;
  label: string;
};
