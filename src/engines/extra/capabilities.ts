/**
 * EXTRA Activation v1 — Bakery physical-stock capabilities.
 * Mutations are Bakery-surface authority (bakery | manager | owner),
 * matching M5 Bakery production coverage — not Owner Ops finance authority.
 * Collection / Customer Operations have no EXTRA mutation rights.
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
  /** Bakery direct-create confirmed Available stock. */
  canCreateConfirmedExtra: boolean;
};

export function canMutateExtraStock(role: RoleCode): boolean {
  return canAccessBakeryWorkspace(role);
}

export function buildExtraWorkspaceCapabilities(input: {
  role: RoleCode;
  staffId: string;
}): ExtraWorkspaceCapabilities {
  const canAccess = canAccessBakeryWorkspace(input.role);
  const canMutate = canMutateExtraStock(input.role);
  return {
    role: input.role,
    staffId: input.staffId,
    canAccessExtraSurface: canAccess,
    canProposeExtra: canMutate,
    canConfirmExtra: canMutate,
    canRejectExtra: canMutate,
    canUndoRejectExtra: canMutate,
    canUnconfirmExtra: canMutate,
    canCreateConfirmedExtra: canMutate,
  };
}
