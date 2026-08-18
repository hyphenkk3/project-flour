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
  /** Derived: confirmed, unsold, now <= order cutoff. */
  available: boolean;
};

export type ExtraCakeOption = {
  id: string;
  name: string;
  sizes: { id: string; label: string }[];
};
