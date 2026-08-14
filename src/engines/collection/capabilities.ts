/**
 * Live Collection workspace capability matrix.
 * Desk handoff only — not finance, not Bakery production, not Delivery.
 *
 * Customer Operations may operate Collection desk handoff (physical pickup).
 * App-layer gates match DB RPCs after
 * 20260814140000_collection_customer_operations_picked_up.sql
 * (owner | manager | collection | customer_operations).
 */

import type { RoleCode } from "@/types/staff";

export type CollectionWorkspaceCapabilities = {
  role: RoleCode;
  staffId: string;
  /** May open authenticated /collection. */
  canAccessCollectionWorkspace: boolean;
  /** Mark Collected (= canonical Picked Up) on Collection detail. */
  canMarkCollected: boolean;
  /** Undo Collected on Collection detail. */
  canUndoCollected: boolean;
};

export function canAccessCollectionWorkspace(role: RoleCode): boolean {
  return (
    role === "collection" ||
    role === "manager" ||
    role === "owner" ||
    role === "customer_operations"
  );
}

export function canMutateCollectionHandoff(role: RoleCode): boolean {
  return canAccessCollectionWorkspace(role);
}

export function buildCollectionWorkspaceCapabilities(input: {
  role: RoleCode;
  staffId: string;
}): CollectionWorkspaceCapabilities {
  const canAccess = canAccessCollectionWorkspace(input.role);
  const canMutate = canMutateCollectionHandoff(input.role);
  return {
    role: input.role,
    staffId: input.staffId,
    canAccessCollectionWorkspace: canAccess,
    canMarkCollected: canMutate,
    canUndoCollected: canMutate,
  };
}
