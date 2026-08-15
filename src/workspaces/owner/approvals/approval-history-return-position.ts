/**
 * Transient UI state for restoring Approval History scroll after
 * Order Workspace return. Not business data — sessionStorage only.
 *
 * Restoration is eligible only when History is opened with the contextual
 * return flag (rp=1) from ← Approval History. Ordinary History entry
 * discards any pending capture without applying it.
 */

const STORAGE_KEY = "wos:owner-approval-history-return-position";
const MAX_AGE_MS = 30 * 60 * 1000;

/** Query flag appended only to Order Workspace → Approval History back links. */
export const APPROVAL_HISTORY_RETURN_POSITION_PARAM = "rp";
export const APPROVAL_HISTORY_RETURN_POSITION_VALUE = "1";

export const APPROVAL_HISTORY_PATH = "/owner/approvals/history";

export type ApprovalHistoryReturnPosition = {
  historyPath: string;
  scrollY: number;
  capturedAt: number;
};

/** Survives React Strict Mode remount after sessionStorage was cleared. */
let takenPosition: ApprovalHistoryReturnPosition | null = null;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parsePosition(raw: string): ApprovalHistoryReturnPosition | null {
  try {
    const data = JSON.parse(raw) as Partial<ApprovalHistoryReturnPosition>;
    if (typeof data.historyPath !== "string" || !data.historyPath) {
      return null;
    }
    if (!isFiniteNumber(data.scrollY) || data.scrollY < 0) return null;
    if (!isFiniteNumber(data.capturedAt)) return null;
    return {
      historyPath: data.historyPath,
      scrollY: data.scrollY,
      capturedAt: data.capturedAt,
    };
  } catch {
    return null;
  }
}

/** Capture document scroll before leaving Approval History for an order. */
export function captureApprovalHistoryReturnPosition(
  historyPath: string = APPROVAL_HISTORY_PATH,
): void {
  if (typeof window === "undefined") return;
  try {
    takenPosition = null;
    const position: ApprovalHistoryReturnPosition = {
      historyPath,
      scrollY: window.scrollY || document.documentElement.scrollTop || 0,
      capturedAt: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // sessionStorage unavailable — navigation still works without restore.
  }
}

/** Drop persisted + in-memory pending return position without applying. */
export function discardApprovalHistoryReturnPosition(): void {
  takenPosition = null;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * One-shot read for a contextual Approval History return only.
 * Caller must pass allowRestore=true when URL has rp=1 from Order Workspace.
 */
export function takeApprovalHistoryReturnPosition(
  historyPath: string,
  allowRestore: boolean,
): ApprovalHistoryReturnPosition | null {
  if (typeof window === "undefined") return null;

  if (!allowRestore) {
    discardApprovalHistoryReturnPosition();
    return null;
  }

  if (
    takenPosition &&
    takenPosition.historyPath === historyPath &&
    Date.now() - takenPosition.capturedAt <= MAX_AGE_MS
  ) {
    return takenPosition;
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const position = parsePosition(raw);
    if (!position) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (Date.now() - position.capturedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (position.historyPath !== historyPath) {
      return null;
    }

    sessionStorage.removeItem(STORAGE_KEY);
    takenPosition = position;
    return position;
  } catch {
    return null;
  }
}

/** Drop the in-memory one-shot copy after restore has settled. */
export function clearTakenApprovalHistoryReturnPosition(): void {
  takenPosition = null;
}

/**
 * Append the one-shot restore flag to a validated Approval History href.
 * Used only on ← Approval History from Order Workspace.
 */
export function withApprovalHistoryReturnPositionFlag(
  historyHref: string,
): string {
  const url = new URL(historyHref, "http://local.invalid");
  if (url.pathname !== APPROVAL_HISTORY_PATH) return historyHref;
  url.searchParams.set(
    APPROVAL_HISTORY_RETURN_POSITION_PARAM,
    APPROVAL_HISTORY_RETURN_POSITION_VALUE,
  );
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}
