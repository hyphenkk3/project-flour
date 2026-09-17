import type { ExtraLifecycle } from "@/engines/extra/availability";

export type { ExtraLifecycle };

export type ExtraStockUnit = {
  id: string;
  lifecycle: ExtraLifecycle;
  cakeName: string;
  sizeLabel: string;
  libraryCakeId: string | null;
  libraryCakeSizeId: string | null;
  preparedOn: string | null;
  /** Earliest customer pickup instant. */
  pickupAvailableFromAt: string | null;
  /**
   * ORDER CUTOFF (`pickup_through_at` column).
   * Latest time a NEW customer may order — not last pickup.
   */
  pickupThroughAt: string | null;
  soldAt: string | null;
  cutIntoSlicesAt: string | null;
  walkInHeldAt: string | null;
  walkInHeldUntil: string | null;
  walkInHeldBy: string | null;
  walkInHeldByName: string | null;
  walkInHoldExtendedAt: string | null;
  walkInHoldReminderSentAt: string | null;
  /** Derived: active walk-in hold (walk_in_held_until >= now). */
  walkInHeld: boolean;
  assignedOrderId: string | null;
  assignedOrderNumber: string | null;
  assignedGuestName: string | null;
  note: string | null;
  proposedAt: string;
  proposedBy: string;
  proposedByName: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  confirmedByName: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectedByName: string | null;
  rejectReason: string | null;
  /** Derived: confirmed, unsold, uncut, now <= order cutoff, not actively held. */
  available: boolean;
};

export type ExtraCakeOption = {
  id: string;
  name: string;
  sizes: { id: string; label: string }[];
};
