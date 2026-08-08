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

/**
 * Validate returnTo for Owner Order Workspace.
 * Only Whole Cake Calendar (with approved params) is accepted as an alternate
 * destination. Anything else falls back to Operations.
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

  const qIndex = decoded.indexOf("?");
  const pathname = qIndex >= 0 ? decoded.slice(0, qIndex) : decoded;
  const search = qIndex >= 0 ? decoded.slice(qIndex + 1) : "";

  if (pathname !== "/owner/calendar") return OPERATIONS_RETURN;

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

/**
 * Append a validated returnTo query to an Owner path.
 * Operations (default) omits the param so direct URLs stay clean.
 */
export function withOwnerReturnTo(
  href: string,
  returnTo: string | null | undefined,
): string {
  const ctx = resolveOwnerReturnTo(returnTo);
  if (ctx.label === "Operations") return href;

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
