import { Resend } from "resend";

import { createServiceClient } from "@/lib/supabase/admin";
import {
  STAFF_NOTIFICATION_DEFINITIONS,
  type StaffNotificationCode,
} from "@/foundation/staff/notification-preferences";
import type { StaffNotificationEventKey } from "@/foundation/staff/notification-event-identity";
import { buildStaffNotificationEmail } from "@/foundation/staff/staff-notification-email";
import { parseNewOrderNotificationPayload } from "@/foundation/staff/staff-notification-new-order";
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
  }): Promise<{ id?: string | null }>;
};

export type StaffNotificationDeliveryResult = {
  eventId: string;
  eventKey: string;
  code: StaffNotificationCode;
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
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

export function createResendStaffNotificationMailer(): StaffNotificationMailer {
  return {
    async send(input) {
      const apiKey = process.env.RESEND_API_KEY?.trim();
      if (!apiKey) {
        throw new Error("RESEND_API_KEY is not configured.");
      }

      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send(
        {
          from: "Whitebird <onboarding@resend.dev>",
          to: [input.to],
          subject: input.subject,
          html: input.html,
        },
        { idempotencyKey: input.idempotencyKey },
      );

      if (error) {
        throw new Error(error.message);
      }

      return { id: data?.id ?? null };
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
  recordDelivery?: (
    staffId: string,
    status: "sent" | "failed",
    detail: { error?: string; resendId?: string | null },
  ) => Promise<void>;
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
    errors: [] as string[],
  };

  for (const recipient of input.recipients) {
    if (already.has(recipient.staffId)) {
      result.skipped += 1;
      continue;
    }

    try {
      const sent = await input.mailer.send({
        to: recipient.email,
        subject: email.subject,
        html: email.html,
        idempotencyKey: `${input.eventKey}:${recipient.staffId}`,
      });
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
  limit?: number;
}): Promise<ClaimedStaffNotificationEmail[]> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc(
    "claim_staff_notification_email_deliveries",
    {
      p_limit: input.limit ?? STAFF_NOTIFICATION_EMAIL_SWEEP_LIMIT,
      p_event_id: input.eventId ?? null,
      p_lease_seconds: STAFF_NOTIFICATION_EMAIL_LEASE_SECONDS,
    },
  );

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
  claimer?: StaffNotificationEmailClaimer;
  completeDelivery?: StaffNotificationEmailCompleter;
}): Promise<StaffNotificationDeliveryResult[]> {
  try {
    const claimed = await (
      input?.claimer ?? claimStaffNotificationEmailDeliveries
    )({
      eventId: input?.eventId,
      limit: STAFF_NOTIFICATION_EMAIL_SWEEP_LIMIT,
    });

    if (claimed.length === 0) return [];

    return deliverClaimedStaffNotificationEmails({
      claimed,
      mailer: input?.mailer ?? createResendStaffNotificationMailer(),
      completeDelivery:
        input?.completeDelivery ?? completeStaffNotificationEmailDelivery,
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
