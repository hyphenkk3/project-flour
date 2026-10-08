import { Resend } from "resend";

import { createServiceClient } from "@/lib/supabase/admin";
import {
  STAFF_NOTIFICATION_DEFINITIONS,
  type StaffNotificationCode,
} from "@/foundation/staff/notification-preferences";
import type { StaffNotificationEventKey } from "@/foundation/staff/notification-event-identity";
import { buildStaffNotificationEmail } from "@/foundation/staff/staff-notification-email";
import { parseNewOrderNotificationPayload } from "@/foundation/staff/staff-notification-new-order";
import { isStaffNotificationEmailDispatchEnabled } from "@/foundation/staff/staff-notification-email-dispatch-gate";
import {
  STAFF_NOTIFICATION_EMAIL_LEASE_SECONDS,
  STAFF_NOTIFICATION_EMAIL_SWEEP_LIMIT,
} from "@/foundation/staff/staff-notification-dispatch-queue";

export type StaffNotificationMailer = {
  send(input: {
    to: string;
    subject: string;
    html: string;
    idempotencyKey: string;
    oneShot?: {
      scopeId: string;
      eventId: string;
      staffId: string;
      deliveryId: string;
    };
  }): Promise<{ id?: string | null; skipped?: boolean }>;
};

export type OneShotStaffNotificationAttempt = NonNullable<
  Parameters<StaffNotificationMailer["send"]>[0]["oneShot"]
>;

export type StaffNotificationDeliveryResult = {
  eventId: string;
  eventKey: string;
  code: StaffNotificationCode;
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  suppressed: number;
  errors: string[];
};

export type ClaimedStaffNotificationEmail = {
  deliveryId: string;
  eventId: string;
  staffId: string;
  staffEmail: string;
  claimedUntil: string;
  eventKey: string;
  code: string;
  title: string;
  description: string;
  href: string | null;
  payload: Record<string, unknown> | null;
  orderId: string | null;
};

export type StaffNotificationEmailClaimer = (input: {
  eventId?: string;
  staffId?: string;
  limit: number;
}) => Promise<ClaimedStaffNotificationEmail[]>;

export type StaffNotificationEmailCompleter = (input: {
  eventId: string;
  staffId: string;
  status: "sent" | "failed";
  error?: string;
  resendId?: string | null;
  claimedUntil: string;
}) => Promise<void>;

export type FreshPickHoldReminderValidator = (input: {
  payload: Record<string, unknown> | null;
}) => Promise<boolean>;

export type StaffNotificationEmailSuppressor = (input: {
  eventId: string;
  staffId: string;
  reason: string;
  claimedUntil: string;
}) => Promise<void>;

export type StaffNotificationEmailDispatchGate = () => Promise<boolean>;

async function isDispatchEnabled(
  gate: StaffNotificationEmailDispatchGate,
): Promise<boolean> {
  try {
    return (await gate()) === true;
  } catch {
    return false;
  }
}

type OrderContentRow = {
  id: string;
  order_number: string | null;
  guest_name: string | null;
  pickup_date: string | null;
};

type ClaimRpcRow = {
  delivery_id: string;
  event_id: string;
  staff_id: string;
  staff_email: string;
  claimed_until: string;
  event_key: string;
  code: string;
  title: string;
  description: string;
  href: string | null;
  payload: Record<string, unknown> | null;
  order_id: string | null;
};

function isNotificationCode(value: string): value is StaffNotificationCode {
  return STAFF_NOTIFICATION_DEFINITIONS.some(
    (definition) => definition.code === value,
  );
}

function isMissingRelation(message: string): boolean {
  return /does not exist|schema cache|could not find|42883/i.test(message);
}

function payloadString(
  payload: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Development fallback only. Production must set RESEND_FROM to a verified sender. */
const DEVELOPMENT_RESEND_FROM = "Whitebird <onboarding@resend.dev>";

function staffNotificationResendFrom(): string {
  return process.env.RESEND_FROM?.trim() || DEVELOPMENT_RESEND_FROM;
}

export function createResendStaffNotificationMailer(
  dispatchEnabled: StaffNotificationEmailDispatchGate = isStaffNotificationEmailDispatchEnabled,
): StaffNotificationMailer {
  return {
    async send(input) {
      if (!(await isDispatchEnabled(dispatchEnabled))) return { skipped: true };

      const apiKey = process.env.RESEND_API_KEY?.trim();
      if (!apiKey) {
        throw new Error("RESEND_API_KEY is not configured.");
      }

      return sendResendStaffNotificationEmail(apiKey, input);
    },
  };
}

async function sendResendStaffNotificationEmail(
  apiKey: string,
  input: {
    to: string;
    subject: string;
    html: string;
    idempotencyKey: string;
  },
): Promise<{ id: string | null }> {
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send(
    {
      from: staffNotificationResendFrom(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
    },
    { idempotencyKey: input.idempotencyKey },
  );

  if (error) throw new Error(error.message);
  return { id: data?.id ?? null };
}

/**
 * Provider adapter reserved for the one-shot route. The database CAS is the
 * durable one-attempt authorization; an ambiguous provider result is recorded
 * as unknown and never returns the scope to a retryable state.
 */
export function createOneShotTestResendMailer(input: {
  authorize: (attempt: OneShotStaffNotificationAttempt) => Promise<boolean>;
  record: (
    attempt: OneShotStaffNotificationAttempt,
    result: "accepted" | "unknown" | "blocked",
    detail?: { providerRequestId?: string | null; error?: string },
  ) => Promise<void>;
  environmentIsDev: () => boolean;
  sendProvider?: (message: {
    to: string;
    subject: string;
    html: string;
    idempotencyKey: string;
  }) => Promise<{ id: string | null }>;
}): StaffNotificationMailer {
  return {
    async send(message) {
      const attempt = message.oneShot;
      if (!attempt || !input.environmentIsDev()) return { skipped: true };
      const apiKey = process.env.RESEND_API_KEY?.trim();
      if (!input.sendProvider && !apiKey) {
        throw new Error("RESEND_API_KEY is not configured.");
      }

      let authorized = false;
      try {
        authorized = await input.authorize(attempt);
      } catch {
        authorized = false;
      }
      if (!authorized) {
        await input.record(attempt, "blocked", {
          error: "One-shot provider authorization was denied.",
        });
        return { skipped: true };
      }

      try {
        const sent = input.sendProvider
          ? await input.sendProvider(message)
          : await sendResendStaffNotificationEmail(apiKey!, message);
        try {
          await input.record(attempt, "accepted", {
            providerRequestId: sent.id,
          });
        } catch (error) {
          console.error(
            "[staff-notifications] One-shot provider result could not be recorded.",
            error,
          );
        }
        return { id: sent.id };
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : "Unknown provider result.";
        try {
          await input.record(attempt, "unknown", { error: messageText });
        } catch (recordError) {
          console.error(
            "[staff-notifications] Ambiguous one-shot result could not be recorded.",
            recordError,
          );
        }
        throw error;
      }
    },
  };
}

export async function deliverStaffNotificationEmailsToRecipients(input: {
  eventId: string;
  eventKey: string;
  content: Parameters<typeof buildStaffNotificationEmail>[0];
  recipients: Array<{ staffId: string; email: string }>;
  alreadyDeliveredStaffIds?: Set<string>;
  mailer: StaffNotificationMailer;
  beforeSend?: (recipient: {
    staffId: string;
    email: string;
  }) => Promise<{ send: true } | { send: false; reason: string }>;
  recordSuppressed?: (staffId: string, reason: string) => Promise<void>;
  recordDelivery?: (
    staffId: string,
    status: "sent" | "failed",
    detail: { error?: string; resendId?: string | null },
  ) => Promise<void>;
  dispatchEnabled?: StaffNotificationEmailDispatchGate;
}): Promise<
  Omit<StaffNotificationDeliveryResult, "eventId" | "eventKey" | "code">
> {
  const already = input.alreadyDeliveredStaffIds ?? new Set<string>();
  const email = buildStaffNotificationEmail(input.content);
  const result = {
    attempted: input.recipients.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    suppressed: 0,
    errors: [] as string[],
  };

  for (const recipient of input.recipients) {
    if (already.has(recipient.staffId)) {
      result.skipped += 1;
      continue;
    }

    try {
      if (
        !(await isDispatchEnabled(
          input.dispatchEnabled ?? isStaffNotificationEmailDispatchEnabled,
        ))
      ) {
        result.skipped += 1;
        continue;
      }

      const sendCheck = await input.beforeSend?.(recipient);
      if (sendCheck?.send === false) {
        await input.recordSuppressed?.(recipient.staffId, sendCheck.reason);
        result.suppressed += 1;
        continue;
      }

      const sent = await input.mailer.send({
        to: recipient.email,
        subject: email.subject,
        html: email.html,
        idempotencyKey: `${input.eventKey}:${recipient.staffId}`,
      });
      if (sent.skipped) {
        result.skipped += 1;
        continue;
      }
      result.sent += 1;
      await input.recordDelivery?.(recipient.staffId, "sent", {
        resendId: sent.id ?? null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown email error.";
      result.failed += 1;
      result.errors.push(`${recipient.staffId}: ${message}`);
      console.error("[staff-notifications] Email delivery failed:", {
        eventId: input.eventId,
        eventKey: input.eventKey,
        staffId: recipient.staffId,
        error: message,
      });
      await input.recordDelivery?.(recipient.staffId, "failed", {
        error: message,
      });
    }
  }

  return result;
}

function mapClaimedRow(row: ClaimRpcRow): ClaimedStaffNotificationEmail {
  return {
    deliveryId: row.delivery_id,
    eventId: row.event_id,
    staffId: row.staff_id,
    staffEmail: row.staff_email,
    claimedUntil: row.claimed_until,
    eventKey: row.event_key,
    code: row.code,
    title: row.title,
    description: row.description,
    href: row.href,
    payload: row.payload,
    orderId: row.order_id,
  };
}

export async function claimStaffNotificationEmailDeliveries(input: {
  eventId?: string;
  staffId?: string;
  limit?: number;
}): Promise<ClaimedStaffNotificationEmail[]> {
  if (!(await isStaffNotificationEmailDispatchEnabled())) return [];

  const admin = createServiceClient();
  const claimArguments = {
    p_limit: input.limit ?? STAFF_NOTIFICATION_EMAIL_SWEEP_LIMIT,
    p_lease_seconds: STAFF_NOTIFICATION_EMAIL_LEASE_SECONDS,
  };
  if (input.staffId !== undefined && (!input.eventId || !input.staffId)) {
    throw new Error("Targeted claims require event and staff IDs.");
  }

  const claim =
    input.staffId !== undefined
      ? await admin.rpc("claim_staff_notification_email_deliveries_for_staff", {
          ...claimArguments,
          p_event_id: input.eventId!,
          p_staff_id: input.staffId,
        })
      : await admin.rpc("claim_staff_notification_email_deliveries", {
          ...claimArguments,
          p_event_id: input.eventId ?? null,
        });
  const { data, error } = claim;

  if (error) {
    if (error.code === "42P01" || isMissingRelation(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  return ((data ?? []) as ClaimRpcRow[]).map(mapClaimedRow);
}

export async function completeStaffNotificationEmailDelivery(input: {
  eventId: string;
  staffId: string;
  status: "sent" | "failed";
  error?: string;
  resendId?: string | null;
  claimedUntil: string;
}): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin.rpc(
    "complete_staff_notification_email_delivery",
    {
      p_event_id: input.eventId,
      p_staff_id: input.staffId,
      p_status: input.status,
      p_error: input.error ?? null,
      p_resend_id: input.resendId ?? null,
      p_claimed_until: input.claimedUntil,
    },
  );

  if (error) {
    if (error.code === "42P01" || isMissingRelation(error.message)) {
      return;
    }
    console.error(
      "[staff-notifications] Failed to record email delivery:",
      error,
    );
  }
}

export async function isCurrentFreshPickHoldReminder(input: {
  payload: Record<string, unknown> | null;
}): Promise<boolean> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc(
    "staff_notification_fresh_pick_hold_reminder_is_current",
    { p_payload: input.payload },
  );

  if (error) throw new Error(error.message);
  return data === true;
}

export async function suppressStaffNotificationEmailDelivery(input: {
  eventId: string;
  staffId: string;
  reason: string;
  claimedUntil: string;
}): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin.rpc(
    "suppress_staff_notification_email_delivery",
    {
      p_event_id: input.eventId,
      p_staff_id: input.staffId,
      p_reason: input.reason,
      p_claimed_until: input.claimedUntil,
    },
  );

  if (error) throw new Error(error.message);
}

async function loadOrderContent(
  orderId: string | null,
): Promise<OrderContentRow | null> {
  if (!orderId) return null;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("orders")
    .select("id, order_number, guest_name, pickup_date")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) return null;
    throw new Error(error.message);
  }

  return (data as OrderContentRow | null) ?? null;
}

async function deliverClaimedStaffNotificationEmails(input: {
  claimed: ClaimedStaffNotificationEmail[];
  mailer: StaffNotificationMailer;
  completeDelivery: StaffNotificationEmailCompleter;
  validateFreshPickHoldReminder: FreshPickHoldReminderValidator;
  suppressDelivery: StaffNotificationEmailSuppressor;
  dispatchEnabled: StaffNotificationEmailDispatchGate;
}): Promise<StaffNotificationDeliveryResult[]> {
  const byEvent = new Map<string, ClaimedStaffNotificationEmail[]>();
  for (const row of input.claimed) {
    if (!isNotificationCode(row.code) || !row.staffEmail.trim()) continue;
    const current = byEvent.get(row.eventId) ?? [];
    current.push(row);
    byEvent.set(row.eventId, current);
  }

  const results: StaffNotificationDeliveryResult[] = [];

  for (const [eventId, rows] of byEvent) {
    const first = rows[0];
    if (!first || !isNotificationCode(first.code)) continue;

    const empty: StaffNotificationDeliveryResult = {
      eventId,
      eventKey: first.eventKey,
      code: first.code,
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      suppressed: 0,
      errors: [],
    };

    try {
      const order = await loadOrderContent(first.orderId);
      const payload = first.payload ?? {};
      const claimedUntilByStaffId = new Map(
        rows.map((row) => [row.staffId, row.claimedUntil] as const),
      );
      const newOrder =
        first.code === "new_order"
          ? parseNewOrderNotificationPayload(payload)
          : null;

      const delivered = await deliverStaffNotificationEmailsToRecipients({
        eventId,
        eventKey: first.eventKey,
        content: {
          code: first.code,
          title: first.title,
          description: first.description,
          href: first.href,
          orderNumber:
            order?.order_number ?? payloadString(payload, "orderNumber"),
          customerName:
            order?.guest_name ?? payloadString(payload, "guestName"),
          cakeName: payloadString(payload, "cakeName"),
          pickupDate:
            order?.pickup_date ?? payloadString(payload, "pickupDate"),
          approvalRequestType: payloadString(payload, "requestType"),
          newOrder,
        },
        recipients: rows.map((row) => ({
          staffId: row.staffId,
          email: row.staffEmail,
        })),
        mailer: input.mailer,
        dispatchEnabled: input.dispatchEnabled,
        beforeSend:
          first.code === "fresh_pick_walk_in_hold_reminder"
            ? async () =>
                (await input.validateFreshPickHoldReminder({
                  payload,
                }))
                  ? { send: true as const }
                  : {
                      send: false as const,
                      reason:
                        "Fresh Pick Walk-in Hold is no longer active or no longer matches this reminder.",
                    }
            : undefined,
        recordSuppressed: async (staffId, reason) =>
          input.suppressDelivery({
            eventId,
            staffId,
            reason,
            claimedUntil:
              claimedUntilByStaffId.get(staffId) ?? first.claimedUntil,
          }),
        recordDelivery: (staffId, status, detail) =>
          input.completeDelivery({
            eventId,
            staffId,
            status,
            error: detail.error,
            resendId: detail.resendId,
            claimedUntil:
              claimedUntilByStaffId.get(staffId) ?? first.claimedUntil,
          }),
      });

      results.push({
        ...empty,
        ...delivered,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown dispatch error.";
      if (isMissingRelation(message)) {
        console.warn(
          "[staff-notifications] Dispatch skipped; notification tables are not applied yet.",
        );
        results.push(empty);
        continue;
      }
      console.error("[staff-notifications] Dispatch failed:", message);
      results.push({
        ...empty,
        failed: 1,
        errors: [message],
      });
    }
  }

  return results;
}

export async function deliverStaffNotificationEvent(input: {
  eventId: string;
  mailer?: StaffNotificationMailer;
  claimer?: StaffNotificationEmailClaimer;
  completeDelivery?: StaffNotificationEmailCompleter;
}): Promise<StaffNotificationDeliveryResult | null> {
  const results = await deliverPendingStaffNotificationEmails({
    eventId: input.eventId,
    mailer: input.mailer,
    claimer: input.claimer,
    completeDelivery: input.completeDelivery,
  });
  return results[0] ?? null;
}

export async function deliverPendingStaffNotificationEmails(input?: {
  mailer?: StaffNotificationMailer;
  eventId?: string;
  staffId?: string;
  claimer?: StaffNotificationEmailClaimer;
  completeDelivery?: StaffNotificationEmailCompleter;
  validateFreshPickHoldReminder?: FreshPickHoldReminderValidator;
  suppressDelivery?: StaffNotificationEmailSuppressor;
  dispatchEnabled?: StaffNotificationEmailDispatchGate;
}): Promise<StaffNotificationDeliveryResult[]> {
  try {
    const dispatchEnabled =
      input?.dispatchEnabled ?? isStaffNotificationEmailDispatchEnabled;
    if (!(await isDispatchEnabled(dispatchEnabled))) return [];

    const claimed = await (
      input?.claimer ?? claimStaffNotificationEmailDeliveries
    )({
      eventId: input?.eventId,
      staffId: input?.staffId,
      limit: STAFF_NOTIFICATION_EMAIL_SWEEP_LIMIT,
    });

    if (claimed.length === 0) return [];

    return deliverClaimedStaffNotificationEmails({
      claimed,
      mailer:
        input?.mailer ?? createResendStaffNotificationMailer(dispatchEnabled),
      dispatchEnabled,
      completeDelivery:
        input?.completeDelivery ?? completeStaffNotificationEmailDelivery,
      validateFreshPickHoldReminder:
        input?.validateFreshPickHoldReminder ?? isCurrentFreshPickHoldReminder,
      suppressDelivery:
        input?.suppressDelivery ?? suppressStaffNotificationEmailDelivery,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown dispatch error.";
    if (isMissingRelation(message)) return [];
    console.error("[staff-notifications] Pending dispatch failed:", message);
    return [];
  }
}

export function isStaffNotificationEventKey(
  value: string,
): value is StaffNotificationEventKey {
  return STAFF_NOTIFICATION_DEFINITIONS.some((definition) =>
    value.startsWith(`${definition.code}:`),
  );
}
