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
  /** Desktop-only shortcut links shown beneath a workspace in the sidebar. */
  children?: Array<{ label: string; href: string }>;
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
    href: "/owner/management",
    available: true,
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
    "management",
    "bakery",
    "collection",
    "customer_operations",
    "library",
  ],
  manager: [
    "home",
    "owner",
    "owner_calendar",
    "management",
    "customer_operations",
    "bakery",
    "collection",
    "library",
  ],
  customer_operations: [
    "home",
    "owner",
    "customer_operations",
    "owner_calendar",
    "collection",
  ],
  bakery: ["home", "bakery", "owner_calendar", "collection", "library"],
  collection: ["home", "collection"],
};

export function getNavigationForRole(role: RoleCode): WorkspaceNavItem[] {
  return ROLE_NAVIGATION[role]
    .map((id) => WORKSPACE_CATALOG[id])
    .map((item) =>
      item.id !== "management"
        ? item
        : {
            ...item,
            children: [
              ...(role === "owner"
                ? [{ label: "Financial", href: "/owner/management/reports" }]
                : []),
              ...(role === "owner" || role === "manager"
                ? [{ label: "Staff", href: "/settings/staff" }]
                : []),
            ],
          },
    )
    .filter((item) => item.available && Boolean(item.href));
}
