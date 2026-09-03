import {
  buildOperationsBoardPath,
  parseOperationsBoardSearchParams,
} from "@/engines/operations/order-board";
import {
  buildWholeCakeCalendarPath,
  resolveCalendarMonthParams,
} from "@/workspaces/owner/calendar/calendar-url";

export type OwnerReturnContext = {
  href: string;
  label: string;
};

const OPERATIONS_RETURN: OwnerReturnContext = {
  href: "/owner",
  label: "Operations",
};

export { buildWholeCakeCalendarPath };

function isSafeRelativeOwnerPath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (value.includes("://")) return false;
  if (value.includes("\\")) return false;
  return true;
}

function pathnameOf(value: string): { pathname: string; search: string } {
  const qIndex = value.indexOf("?");
  const pathname = qIndex >= 0 ? value.slice(0, qIndex) : value;
  const search = qIndex >= 0 ? value.slice(qIndex + 1) : "";
  const hashIndex = pathname.indexOf("#");
  return {
    pathname: hashIndex >= 0 ? pathname.slice(0, hashIndex) : pathname,
    search,
  };
}

/**
 * Validate returnTo for Owner Order Workspace.
 * Accepted destinations:
 * - Home (`/home`) — Home cockpit deep-links into Order Workspace
 * - Operations (`/owner`, optionally with approved board query params)
 * - Whole Cake Calendar (with approved params)
 * - Approvals inbox (`/owner/approvals`)
 * - Approval History (`/owner/approvals/history`)
 * Anything else falls back to default Operations (Today).
 */
export function resolveOwnerReturnTo(
  raw: string | null | undefined,
): OwnerReturnContext {
  if (!raw) return OPERATIONS_RETURN;

  let decoded = raw.trim();
  try {
    // Tolerate double-encoding from nested link propagation.
    if (decoded.includes("%2F") || decoded.includes("%3F")) {
      decoded = decodeURIComponent(decoded);
    }
  } catch {
    return OPERATIONS_RETURN;
  }

  if (!isSafeRelativeOwnerPath(decoded)) return OPERATIONS_RETURN;

  const { pathname, search } = pathnameOf(decoded);

  if (pathname === "/home") {
    return { href: "/home", label: "Home" };
  }

  if (pathname === "/owner/calendar") {
    const params = new URLSearchParams(search);
    const resolved = resolveCalendarMonthParams({
      year: params.get("year") ?? undefined,
      month: params.get("month") ?? undefined,
      view: params.get("view") ?? undefined,
      matrix: params.get("matrix") ?? undefined,
    });

    return {
      href: buildWholeCakeCalendarPath(resolved),
      label: "Whole Cake Calendar",
    };
  }

  if (pathname === "/owner") {
    const params = new URLSearchParams(search);
    const query = parseOperationsBoardSearchParams({
      pickup: params.get("pickup") ?? undefined,
      date: params.get("date") ?? undefined,
      status: params.get("status") ?? undefined,
      lifecycle: params.get("lifecycle") ?? undefined,
      sort: params.get("sort") ?? undefined,
      search: params.get("search") ?? undefined,
    });
    return {
      href: buildOperationsBoardPath(query),
      label: "Operations",
    };
  }

  if (pathname === "/owner/approvals/history") {
    return {
      href: "/owner/approvals/history",
      label: "Approval History",
    };
  }

  if (pathname === "/owner/approvals") {
    return {
      href: "/owner/approvals",
      label: "Approvals",
    };
  }

  return OPERATIONS_RETURN;
}

/** True when returnTo should be forwarded on nested Owner workspace links. */
export function shouldPropagateOwnerReturnTo(
  ctx: OwnerReturnContext,
): boolean {
  return ctx.href !== OPERATIONS_RETURN.href;
}

/**
 * Append a validated returnTo query to an Owner path.
 * Default Operations (Today, `/owner`) omits the param so direct URLs stay clean.
 */
export function withOwnerReturnTo(
  href: string,
  returnTo: string | null | undefined,
): string {
  const ctx = resolveOwnerReturnTo(returnTo);
  if (!shouldPropagateOwnerReturnTo(ctx)) return href;

  const hashIndex = href.indexOf("#");
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const sep = withoutHash.includes("?") ? "&" : "?";
  return `${withoutHash}${sep}returnTo=${encodeURIComponent(ctx.href)}${hash}`;
}

export function ownerOrderWorkspaceHref(
  orderId: string,
  returnTo?: string | null,
): string {
  return withOwnerReturnTo(`/owner/orders/${orderId}`, returnTo);
}
