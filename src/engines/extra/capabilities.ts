/**
 * EXTRA Activation v1 — Bakery physical-stock capabilities.
 * Mutations are Bakery-surface authority (bakery | manager | owner),
 * matching M5 Bakery production coverage — not Owner Ops finance authority.
 * Walk-in Hold is a counter / walk-in action: Owner, Manager, Customer Operations.
 * Bakery may see held state. Collection has no Walk-in Hold action.
 */

import type { RoleCode } from "@/types/staff";
import { canAccessBakeryWorkspace } from "@/engines/bakery/capabilities";

export type ExtraWorkspaceCapabilities = {
  role: RoleCode;
  staffId: string;
  /** May open Bakery EXTRA area (same gate as /bakery). */
  canAccessExtraSurface: boolean;
  /** Propose EXTRA (creates lifecycle=proposed). */
  canProposeExtra: boolean;
  /** Bakery final authority: confirm Owner proposals. */
  canConfirmExtra: boolean;
  /** Bakery final authority: reject Owner proposals. */
  canRejectExtra: boolean;
  /** Bakery final authority: restore rejected EXTRA to proposed. */
  canUndoRejectExtra: boolean;
  /**
   * Bakery final authority: revoke a confirmed Fresh Pick back to proposed.
   * Does not delete the Library cake; does not write rejected (Past).
   */
  canUnconfirmExtra: boolean;
  /** Assign a confirmed Fresh Pick to an existing order (sets sold_at + extra_stock_id). */
  canAssignExtraToOrder: boolean;
  /** Move a confirmed unsold Fresh Pick to another valid pickup window. */
  canMoveExtraWindow: boolean;
  /** Stop offering a confirmed unsold Extra as a whole cake (cut into slices). */
  canCutExtraIntoSlices: boolean;
  /** Bakery direct-create confirmed Available stock. */
  canCreateConfirmedExtra: boolean;
  /** See Walk-in Hold state on a Fresh Pick. */
  canViewWalkInHold: boolean;
  /** Place a Walk-in Hold on a Fresh Pick. */
  canCreateWalkInHold: boolean;
  /** Extend an active Walk-in Hold once. */
  canExtendWalkInHold: boolean;
  /** Release an active Walk-in Hold. */
  canReleaseWalkInHold: boolean;
};

export function canMutateExtraStock(role: RoleCode): boolean {
  return canAccessBakeryWorkspace(role);
}

export function canMutateExtraWalkInHold(role: RoleCode): boolean {
  return (
    role === "owner" ||
    role === "manager" ||
    role === "customer_operations"
  );
}

export function canViewExtraWalkInHold(role: RoleCode): boolean {
  return canMutateExtraWalkInHold(role) || role === "bakery";
}

export function buildExtraWorkspaceCapabilities(input: {
  role: RoleCode;
  staffId: string;
}): ExtraWorkspaceCapabilities {
  const canAccess = canAccessBakeryWorkspace(input.role);
  const canMutate = canMutateExtraStock(input.role);
  const canHold = canMutateExtraWalkInHold(input.role);
  return {
    role: input.role,
    staffId: input.staffId,
    canAccessExtraSurface: canAccess,
    canProposeExtra: canMutate,
    canConfirmExtra: canMutate,
    canRejectExtra: canMutate,
    canUndoRejectExtra: canMutate,
    canUnconfirmExtra: canMutate,
    canAssignExtraToOrder: canMutate,
    canMoveExtraWindow: canMutate,
    canCutExtraIntoSlices: canMutate,
    canCreateConfirmedExtra: canMutate,
    canViewWalkInHold: canViewExtraWalkInHold(input.role),
    canCreateWalkInHold: canHold,
    canExtendWalkInHold: canHold,
    canReleaseWalkInHold: canHold,
  };
}

/** Home Fresh Picks section: Extra capabilities remain authoritative. */
export function canSeeHomeFreshPicks(
  capabilities: ExtraWorkspaceCapabilities,
): boolean {
  return (
    capabilities.canViewWalkInHold ||
    capabilities.canAssignExtraToOrder ||
    capabilities.canMoveExtraWindow ||
    capabilities.canCutExtraIntoSlices ||
    capabilities.canUnconfirmExtra
  );
}

/**
 * State-aware Extra mutation buttons for Home / ExtraBoard.
 * Hold / extend / release stay on WalkInHoldPanel via existing hold capabilities.
 */
export function extraOperationalActionFlags(input: {
  capabilities: ExtraWorkspaceCapabilities;
  walkInHeld: boolean;
}): {
  assign: boolean;
  move: boolean;
  cut: boolean;
  unconfirm: boolean;
} {
  const open = !input.walkInHeld;
  return {
    assign: input.capabilities.canAssignExtraToOrder && open,
    move: input.capabilities.canMoveExtraWindow && open,
    cut: input.capabilities.canCutExtraIntoSlices && open,
    unconfirm: input.capabilities.canUnconfirmExtra && open,
  };
}

export function extraFreshPickOperationalStatus(input: {
  soldAt: string | null;
  cutIntoSlicesAt: string | null;
  walkInHeld: boolean;
  available: boolean;
}): "sold" | "sliced" | "held" | "available" | "unavailable" {
  if (input.soldAt) return "sold";
  if (input.cutIntoSlicesAt) return "sliced";
  if (input.walkInHeld) return "held";
  if (input.available) return "available";
  return "unavailable";
}

export function extraFreshPickOperationalStatusLabel(
  status: ReturnType<typeof extraFreshPickOperationalStatus>,
): string {
  switch (status) {
    case "sold":
      return "Sold";
    case "sliced":
      return "Cut into slices";
    case "held":
      return "On walk-in hold";
    case "available":
      return "Available";
    default:
      return "Unavailable";
  }
}
