import { formatShortBusinessDate } from "@/lib/dates";
import type { ToastInput } from "@/components/ui/Toast";
import type {
  StaffNotificationCode,
  StaffNotificationWebMode,
} from "@/foundation/staff/notification-preferences";
import type { StorefrontOrderListItem } from "@/types/storefront";
import { ownerOrderWorkspaceHref } from "@/workspaces/owner/navigation/return-to";

export type StaffNotificationEvent = {
  id: string;
  code: StaffNotificationCode;
  orderId?: string | null;
  title: string;
  description: string;
  href?: string | null;
  actionLabel?: string | null;
  tone?: ToastInput["tone"];
};

const claimedWebEventIds = new Set<string>();
const CLAIM_STORAGE_KEY = "wos-staff-notification-web-claims";
const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
const CLAIM_LIMIT = 500;
const CLAIM_DATABASE = "wos-staff-notification-claims";
const CLAIM_STORE = "claims";

export type StaffNotificationClaimResult = {
  claimed: boolean;
  crossTabProtected: boolean;
  presentationFailed?: boolean;
};

type StoredClaim = { claimedAt: number };
type StoredClaims = Record<string, StoredClaim>;

function rememberWebEventClaim(claimId: string): void {
  claimedWebEventIds.add(claimId);
  if (claimedWebEventIds.size > CLAIM_LIMIT) {
    const oldest = claimedWebEventIds.values().next().value;
    if (oldest) claimedWebEventIds.delete(oldest);
  }
}

function readStoredClaims(): StoredClaims | null {
  try {
    const raw = window.localStorage.getItem(CLAIM_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => {
          if (!value || typeof value !== "object") return false;
          const claimedAt = (value as { claimedAt?: unknown }).claimedAt;
          return (
            typeof claimedAt === "number" &&
            Number.isFinite(claimedAt) &&
            claimedAt <= now &&
            now - claimedAt <= CLAIM_TTL_MS
          );
        })
        .slice(-CLAIM_LIMIT),
    ) as StoredClaims;
  } catch {
    return null;
  }
}

function saveStoredClaim(eventId: string, claims: StoredClaims): boolean {
  try {
    const next = Object.fromEntries(
      [...Object.entries(claims), [eventId, { claimedAt: Date.now() }]].slice(
        -CLAIM_LIMIT,
      ),
    );
    window.localStorage.setItem(CLAIM_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

let webClaimChannel: BroadcastChannel | null | undefined;

function webClaimBroadcast(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (webClaimChannel !== undefined) return webClaimChannel;

  try {
    webClaimChannel = new BroadcastChannel("wos-staff-notification-web");
    webClaimChannel.onmessage = (event) => {
      if (typeof event.data === "string") {
        rememberWebEventClaim(event.data);
      }
    };
  } catch {
    webClaimChannel = null;
  }

  return webClaimChannel;
}

/**
 * Cross-tab web toast claim. Email dedup is server-side and does not use this.
 */
export function tryClaimStaffNotification(eventId: string): boolean {
  if (typeof window === "undefined") return false;

  webClaimBroadcast();

  if (claimedWebEventIds.has(eventId)) return false;

  rememberWebEventClaim(eventId);
  try {
    webClaimBroadcast()?.postMessage(eventId);
  } catch {
    // BroadcastChannel may be unavailable.
  }

  return true;
}

/**
 * Claims a Web event once across tabs for the same signed-in staff profile.
 * Web Locks serialize the read/claim/write sequence; localStorage persists the
 * winning event ID across refreshes. Browsers without Web Locks use an
 * IndexedDB read/write transaction for same-origin tab coordination.
 */
export async function claimStaffNotificationForStaff(
  staffId: string,
  eventId: string,
  present: () => void,
): Promise<StaffNotificationClaimResult> {
  if (typeof window === "undefined" || !staffId || !eventId) {
    return { claimed: false, crossTabProtected: false };
  }

  const claimId = `${staffId}:${eventId}`;
  const lockManager = navigator.locks;
  if (!lockManager || typeof lockManager.request !== "function") {
    return claimWithIndexedDb(claimId, present);
  }

  try {
    return await lockManager.request(
      `wos-staff-notification:${claimId}`,
      async () => {
        if (claimedWebEventIds.has(claimId)) {
          return { claimed: false, crossTabProtected: true };
        }

        const claims = readStoredClaims();
        if (!claims) {
          return await claimWithIndexedDb(claimId, present);
        }

        if (claims[claimId]) {
          rememberWebEventClaim(claimId);
          return { claimed: false, crossTabProtected: true };
        }

        try {
          present();
        } catch {
          return {
            claimed: false,
            crossTabProtected: true,
            presentationFailed: true,
          };
        }

        // Persist after presentation so a failure before the toast is shown
        // cannot consume an event that recovery still needs to deliver.
        let persisted = saveStoredClaim(claimId, claims);
        if (!persisted) {
          const fallbackClaim = await claimWithIndexedDb(claimId, () => {});
          persisted = fallbackClaim.crossTabProtected;
        }
        rememberWebEventClaim(claimId);
        try {
          webClaimBroadcast()?.postMessage(claimId);
        } catch {
          // The persistent claim remains authoritative.
        }
        return { claimed: true, crossTabProtected: persisted };
      },
    );
  } catch {
    return claimWithIndexedDb(claimId, present);
  }
}

/**
 * Safari versions without Web Locks use a short IndexedDB read/write
 * transaction, which serializes same-origin tabs. Presentation runs before
 * the claim is committed: an interrupted transaction may duplicate a toast,
 * but cannot silently consume an event that was never presented.
 */
function claimWithIndexedDb(
  claimId: string,
  present: () => void,
): Promise<StaffNotificationClaimResult> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(claimWithLocalFallback(claimId, present));
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: StaffNotificationClaimResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(CLAIM_DATABASE, 1);
    } catch {
      finish(claimWithLocalFallback(claimId, present));
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CLAIM_STORE)) {
        database.createObjectStore(CLAIM_STORE, { keyPath: "id" });
      }
    };
    request.onerror = () => finish(claimWithLocalFallback(claimId, present));
    request.onblocked = () =>
      finish({
        claimed: false,
        crossTabProtected: false,
        presentationFailed: true,
      });
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(CLAIM_STORE, "readwrite");
      } catch {
        database.close();
        finish(claimWithLocalFallback(claimId, present));
        return;
      }
      const store = transaction.objectStore(CLAIM_STORE);
      const read = store.getAll();
      let didPresent = false;
      let result: StaffNotificationClaimResult = {
        claimed: false,
        crossTabProtected: true,
      };
      read.onerror = () => transaction.abort();
      read.onsuccess = () => {
        const all = read.result as Array<{ id: string; claimedAt: number }>;
        const now = Date.now();
        const records = all.filter(
          (record) =>
            typeof record.id === "string" &&
            Number.isFinite(record.claimedAt) &&
            record.claimedAt <= now &&
            now - record.claimedAt <= CLAIM_TTL_MS,
        );
        const validIds = new Set(records.map((record) => record.id));
        for (const record of all) {
          if (!validIds.has(record.id)) store.delete(record.id);
        }
        if (validIds.has(claimId)) {
          rememberWebEventClaim(claimId);
          result = { claimed: false, crossTabProtected: true };
          return;
        }

        try {
          present();
          didPresent = true;
        } catch {
          result = {
            claimed: false,
            crossTabProtected: true,
            presentationFailed: true,
          };
          transaction.abort();
          return;
        }

        const retained = records
          .sort((left, right) => left.claimedAt - right.claimedAt)
          .slice(-(CLAIM_LIMIT - 1));
        const retainedIds = new Set(retained.map((record) => record.id));
        for (const record of records) {
          if (!retainedIds.has(record.id)) store.delete(record.id);
        }
        store.put({ id: claimId, claimedAt: now });
        result = { claimed: true, crossTabProtected: true };
      };
      transaction.oncomplete = () => {
        database.close();
        if (result.claimed) {
          rememberWebEventClaim(claimId);
          try {
            webClaimBroadcast()?.postMessage(claimId);
          } catch {
            // The transaction remains authoritative.
          }
        }
        finish(result);
      };
      transaction.onerror = transaction.onabort = () => {
        database.close();
        if (didPresent) {
          rememberWebEventClaim(claimId);
          finish({ claimed: true, crossTabProtected: false });
        } else {
          finish(
            result.presentationFailed
              ? result
              : claimWithLocalFallback(claimId, present),
          );
        }
      };
    };
  });
}

function claimWithLocalFallback(
  claimId: string,
  present: () => void,
): StaffNotificationClaimResult {
  webClaimBroadcast();
  if (claimedWebEventIds.has(claimId)) {
    return { claimed: false, crossTabProtected: false };
  }
  try {
    present();
    rememberWebEventClaim(claimId);
    try {
      webClaimBroadcast()?.postMessage(claimId);
    } catch {
      // Local delivery succeeded; only cross-tab coordination degraded.
    }
    return { claimed: true, crossTabProtected: false };
  } catch {
    return {
      claimed: false,
      crossTabProtected: false,
      presentationFailed: true,
    };
  }
}

export function notificationDurationMs(
  mode: StaffNotificationWebMode,
): number | null {
  return mode === "persistent" ? null : 4500;
}

export function buildStaffNotificationToast(
  event: StaffNotificationEvent,
  mode: StaffNotificationWebMode,
): ToastInput {
  const durationMs = notificationDurationMs(mode);
  const showAction =
    mode === "persistent" || event.code === "waiting_list_new_request";

  return {
    title: event.title,
    description: event.description,
    tone: event.tone ?? "info",
    durationMs,
    actionHref: showAction ? (event.href ?? undefined) : undefined,
    actionLabel: showAction ? (event.actionLabel ?? "View") : undefined,
  };
}

export type NotificationOrderSummary = Pick<
  StorefrontOrderListItem,
  | "id"
  | "customerName"
  | "cakeName"
  | "pickupDate"
  | "status"
  | "orderSource"
  | "orderNumber"
>;

function orderHref(orderId: string): string {
  return ownerOrderWorkspaceHref(orderId, "/owner");
}

function orderDescription(order: NotificationOrderSummary): string {
  const parts = [
    order.orderNumber,
    order.customerName,
    order.cakeName,
    formatShortBusinessDate(order.pickupDate),
  ].filter((part) => Boolean(part && String(part).trim()));

  return parts.join(" · ");
}

export function buildOrderEventNotification(
  code: Exclude<
    StaffNotificationCode,
    | "approval_required"
    | "last_minute"
    | "new_order"
    | "fresh_pick_walk_in_hold_reminder"
    | "waiting_list_new_request"
  >,
  order: NotificationOrderSummary,
  eventId: string,
): StaffNotificationEvent {
  const base = {
    id: eventId,
    code,
    orderId: order.id,
    href: orderHref(order.id),
    actionLabel: "View order",
    description: orderDescription(order),
  };

  switch (code) {
    case "order_paid":
      return {
        ...base,
        title: "Order paid",
        tone: "success",
      };

    case "order_confirmed":
      return {
        ...base,
        title: "Order confirmed",
        tone: "success",
      };

    case "order_cancelled":
      return {
        ...base,
        title: "Order cancelled",
        tone: "warning",
      };

    case "order_edited":
      return {
        ...base,
        title: "Order edited",
        tone: "info",
      };
  }
}

export function buildNewOrderNotification(
  order: NotificationOrderSummary,
  eventId: string,
): StaffNotificationEvent {
  return {
    id: eventId,
    code: "new_order",
    orderId: order.id,
    title: "New order received",
    description: orderDescription(order),
    href: orderHref(order.id),
    actionLabel: "View order",
    tone: "info",
  };
}

export function buildLastMinuteNotification(
  order: NotificationOrderSummary,
  eventId: string,
): StaffNotificationEvent {
  return {
    id: eventId,
    code: "last_minute",
    orderId: order.id,
    title: "Last-minute order",
    description: orderDescription(order),
    href: orderHref(order.id),
    actionLabel: "View order",
    tone: "warning",
  };
}

export function buildWaitingListNewRequestNotification(input: {
  eventId: string;
  href: string;
  description: string;
}): StaffNotificationEvent {
  return {
    id: input.eventId,
    code: "waiting_list_new_request",
    orderId: null,
    title: "New waiting list request",
    description: input.description,
    href: input.href,
    actionLabel: "View",
    tone: "info",
  };
}

export function buildApprovalRequiredNotification(approval: {
  id: string;
  orderId?: string | null;
  requestType?: string | null;
  eventId?: string;
}): StaffNotificationEvent {
  const orderId = approval.orderId ?? null;

  return {
    id: approval.eventId ?? `approval_required:${approval.id}`,
    code: "approval_required",
    orderId,
    title: "Approval required",
    description: approval.requestType
      ? `Approval requested · ${approval.requestType}`
      : "A new approval request requires your attention.",
    href: orderId ? orderHref(orderId) : "/owner/approvals",
    actionLabel: orderId ? "View order" : "View approvals",
    tone: "warning",
  };
}
