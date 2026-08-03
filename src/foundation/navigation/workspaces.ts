import type { RoleCode } from "@/types/staff";

export type WorkspaceId =
  "home" | "customer_operations" | "bakery" | "collection" | "management";

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
  customer_operations: {
    id: "customer_operations",
    label: "Customer Operations",
    href: "/customer-operations/customers",
    available: true,
  },
  bakery: {
    id: "bakery",
    label: "Bakery",
    href: null,
    available: false,
  },
  collection: {
    id: "collection",
    label: "Collection",
    href: null,
    available: false,
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
  owner: ["home", "customer_operations", "bakery", "collection", "management"],
  manager: [
    "home",
    "customer_operations",
    "bakery",
    "collection",
    "management",
  ],
  customer_operations: ["home", "customer_operations", "collection"],
  bakery: ["home", "bakery"],
  collection: ["home", "collection"],
};

export function getNavigationForRole(role: RoleCode): WorkspaceNavItem[] {
  return ROLE_NAVIGATION[role].map((id) => WORKSPACE_CATALOG[id]);
}
