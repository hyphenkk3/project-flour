import type { RoleCode } from "@/types/staff";

export type WaitingListCapabilities = {
  role: RoleCode;
  canViewWaitingList: boolean;
  canManageWaitingList: boolean;
  canConfigureWaitingList: boolean;
};

export function canViewWaitingList(role: RoleCode): boolean {
  return (
    role === "owner" ||
    role === "manager" ||
    role === "bakery" ||
    role === "customer_operations"
  );
}

export function canManageWaitingList(role: RoleCode): boolean {
  return canViewWaitingList(role);
}

export function canConfigureWaitingList(role: RoleCode): boolean {
  return role === "owner" || role === "manager" || role === "bakery";
}

export function buildWaitingListCapabilities(
  role: RoleCode,
): WaitingListCapabilities {
  return {
    role,
    canViewWaitingList: canViewWaitingList(role),
    canManageWaitingList: canManageWaitingList(role),
    canConfigureWaitingList: canConfigureWaitingList(role),
  };
}
