/**
 * M5 — Bakery workspace capability matrix.
 * Workspace access is separate from Owner Ops / Delivery finance capabilities.
 * P1: read-only (production mutations false until P2/P3).
 */

import type { RoleCode } from "@/types/staff";

export type BakeryWorkspaceCapabilities = {
  role: RoleCode;
  staffId: string;
  /** May open authenticated /bakery. */
  canAccessBakeryWorkspace: boolean;
  /** M5-P2: Start Production on Bakery workspace. */
  canStartProduction: boolean;
  /** M5-P2: Undo Start on Bakery workspace. */
  canUndoStart: boolean;
  /** M5-P3: Mark Ready on Bakery workspace. */
  canMarkReady: boolean;
  /** M5-P3: Undo Ready on Bakery workspace. */
  canUndoReady: boolean;
};

export function canAccessBakeryWorkspace(role: RoleCode): boolean {
  return role === "bakery" || role === "manager" || role === "owner";
}

export function buildBakeryWorkspaceCapabilities(input: {
  role: RoleCode;
  staffId: string;
}): BakeryWorkspaceCapabilities {
  const canAccess = canAccessBakeryWorkspace(input.role);
  return {
    role: input.role,
    staffId: input.staffId,
    canAccessBakeryWorkspace: canAccess,
    // M5-P1: no production mutations from Bakery.
    canStartProduction: false,
    canUndoStart: false,
    canMarkReady: false,
    canUndoReady: false,
  };
}
