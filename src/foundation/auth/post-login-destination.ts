import { canAccessWorkspace } from "@/foundation/navigation/access";
import {
  getNavigationForRole,
  WORKSPACE_CATALOG,
} from "@/foundation/navigation/workspaces";
import type { RoleCode } from "@/types/staff";

/**
 * Sanitize an optional post-login return path.
 * Only same-origin relative paths are accepted (no open redirects).
 */
export function sanitizePostLoginPath(
  requested: string | null | undefined,
): string | null {
  if (requested == null) return null;
  const raw = String(requested).trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw === "/login" || raw.startsWith("/login?")) return null;
  return raw;
}

/**
 * True when `path` is under a workspace the role can navigate to.
 */
export function canAccessPostLoginPath(role: RoleCode, path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0] ?? path;
  const hrefs = getNavigationForRole(role)
    .map((item) => item.href)
    .filter((href): href is string => Boolean(href))
    .sort((a, b) => b.length - a.length);

  return hrefs.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

/**
 * Pick the default landing when no explicit authorized return path applies.
 * Home wins when the role has Home access; otherwise use the first available
 * workspace href for that role.
 */
export function pickDefaultPostLoginDestination(input: {
  hasHomeAccess: boolean;
  fallbackHref: string | null;
}): string {
  if (input.hasHomeAccess) {
    return WORKSPACE_CATALOG.home.href ?? "/home";
  }
  return input.fallbackHref ?? "/login";
}

/**
 * Default authenticated landing after login.
 *
 * - Explicit authorized `next` is preserved.
 * - Otherwise Home when the role has Home in ROLE_NAVIGATION.
 * - Otherwise the first available workspace for the role.
 */
export function resolvePostLoginDestination(
  role: RoleCode,
  requestedNext?: string | null,
): string {
  const next = sanitizePostLoginPath(requestedNext);
  if (next && canAccessPostLoginPath(role, next)) {
    return next;
  }

  const nav = getNavigationForRole(role);
  return pickDefaultPostLoginDestination({
    hasHomeAccess: canAccessWorkspace(role, "home"),
    fallbackHref: nav.find((item) => item.id !== "home")?.href ?? nav[0]?.href ?? null,
  });
}
