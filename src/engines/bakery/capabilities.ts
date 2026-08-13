/**
 * M5 — Bakery workspace capability matrix.
 * Workspace access is separate from Owner Ops / Delivery finance capabilities.
 * P2: Start / Undo Start for Bakery · Manager · Owner. Ready mutations remain P3.
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

export function canMutateBakeryProduction(role: RoleCode): boolean {
  return canAccessBakeryWorkspace(role);
}

export function buildBakeryWorkspaceCapabilities(input: {
  role: RoleCode;
  staffId: string;
}): BakeryWorkspaceCapabilities {
  const canAccess = canAccessBakeryWorkspace(input.role);
  const canProduce = canMutateBakeryProduction(input.role);
  return {
    role: input.role,
    staffId: input.staffId,
    canAccessBakeryWorkspace: canAccess,
    canStartProduction: canProduce,
    canUndoStart: canProduce,
    // M5-P3: no Bakery Ready mutations yet.
    canMarkReady: false,
    canUndoReady: false,
  };
}
