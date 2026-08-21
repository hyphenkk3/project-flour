import type { RoleCode } from "@/types/staff";

export type WorkspaceId =
  | "home"
  | "owner"
  | "owner_calendar"
  | "customer_operations"
  | "bakery"
  | "collection"
  | "library"
  | "management";

export type WorkspaceNavItem = {
  id: WorkspaceId;
  label: string;
  href: string | null;
  /** Fully implemented and navigable in the current version. */
  available: boolean;
};

/**
 * Canonical workspace catalog for Whitebird Operating System.
 * Visibility is role-gated; availability controls whether the item is active
 * or shown as “Coming later”.
 */
export const WORKSPACE_CATALOG: Record<WorkspaceId, WorkspaceNavItem> = {
  home: {
    id: "home",
    label: "Home",
    href: "/home",
    available: true,
  },
  owner: {
    id: "owner",
    label: "Operations",
    href: "/owner",
    available: true,
  },
  owner_calendar: {
    id: "owner_calendar",
    label: "Whole Cake Calendar",
    href: "/owner/calendar",
    available: true,
  },
  customer_operations: {
    id: "customer_operations",
    label: "Customer Operations",
    href: "/customer-operations/customers",
    available: true,
  },
  bakery: {
    id: "bakery",
    label: "Bakery",
    href: "/bakery",
    available: true,
  },
  collection: {
    id: "collection",
    label: "Collection",
    href: "/collection",
    available: true,
  },
  library: {
    id: "library",
    label: "Library",
    href: "/library/cakes",
    available: true,
  },
  management: {
    id: "management",
    label: "Management",
    href: null,
    available: false,
  },
};

/**
 * Central role → workspace visibility map.
 * Components must consume this via getNavigationForRole — do not duplicate.
 */
export const ROLE_NAVIGATION: Record<RoleCode, readonly WorkspaceId[]> = {
  owner: [
    "home",
    "owner",
    "owner_calendar",
    "bakery",
    "collection",
    "customer_operations",
    "library",
  ],
  manager: [
    "home",
    "owner",
    "owner_calendar",
    "customer_operations",
    "bakery",
    "collection",
    "library",
    "management",
  ],
  customer_operations: [
    "home",
    "owner",
    "customer_operations",
    "owner_calendar",
    "collection",
  ],
  bakery: ["home", "bakery", "collection"],
  collection: ["home", "collection"],
};

export function getNavigationForRole(role: RoleCode): WorkspaceNavItem[] {
  return ROLE_NAVIGATION[role]
    .map((id) => WORKSPACE_CATALOG[id])
    .filter((item) => item.available && Boolean(item.href));
}
