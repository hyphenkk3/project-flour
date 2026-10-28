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
  /** Route family roots used to resolve the shared staff header title. */
  routePrefixes?: readonly string[];
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
    routePrefixes: ["/home"],
    available: true,
  },
  owner: {
    id: "owner",
    label: "Operations",
    href: "/owner",
    routePrefixes: ["/owner"],
    available: true,
  },
  owner_calendar: {
    id: "owner_calendar",
    label: "Whole Cake Calendar",
    href: "/owner/calendar",
    routePrefixes: ["/owner/calendar"],
    available: true,
  },
  customer_operations: {
    id: "customer_operations",
    label: "Customer Operations",
    href: "/customer-operations/customers",
    routePrefixes: ["/customer-operations"],
    available: true,
  },
  bakery: {
    id: "bakery",
    label: "Bakery",
    href: "/bakery",
    routePrefixes: ["/bakery"],
    available: true,
  },
  collection: {
    id: "collection",
    label: "Collection",
    href: "/collection",
    routePrefixes: ["/collection"],
    available: true,
  },
  library: {
    id: "library",
    label: "Library",
    href: "/library/cakes",
    routePrefixes: ["/library"],
    available: true,
  },
  management: {
    id: "management",
    label: "Management",
    href: "/owner/management",
    routePrefixes: ["/owner/management", "/settings/staff"],
    available: true,
  },
};

/** Resolve the shared header title from the most specific canonical workspace route. */
export function getWorkspaceTitleForPathname(pathname: string): string | null {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const match = Object.values(WORKSPACE_CATALOG)
    .flatMap((item) =>
      (item.routePrefixes ?? []).map((prefix) => ({
        label: item.label,
        prefix,
      })),
    )
    .filter(
      ({ prefix }) =>
        normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
    )
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  if (match) return match.label;
  if (normalizedPath === "/settings" || normalizedPath.startsWith("/settings/")) {
    return "Settings";
  }
  return null;
}

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
    "library",
    "customer_operations",
    "management",
  ],
  manager: [
    "home",
    "owner",
    "owner_calendar",
    "bakery",
    "collection",
    "library",
    "customer_operations",
    "management",
  ],
  customer_operations: [
    "home",
    "owner",
    "owner_calendar",
    "collection",
    "customer_operations",
  ],
  bakery: ["home", "owner_calendar", "bakery", "collection", "library"],
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
