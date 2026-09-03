import { Resend } from "resend";

import { createServiceClient } from "@/lib/supabase/admin";
import {
  STAFF_NOTIFICATION_DEFINITIONS,
  type StaffNotificationCode,
} from "@/foundation/staff/notification-preferences";
import {
  selectStaffEmailRecipients,
  type StaffNotificationEventKey,
} from "@/foundation/staff/notification-event-identity";
import { buildStaffNotificationEmail } from "@/foundation/staff/staff-notification-email";

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

type NotificationEventRow = {
  id: string;
  event_key: string;
  code: string;
  order_id: string | null;
  approval_id: string | null;
  title: string;
  description: string;
  href: string | null;
  payload: Record<string, unknown> | null;
};

type OrderContentRow = {
  id: string;
  order_number: string | null;
  guest_name: string | null;
  cake_name: string | null;
  pickup_date: string | null;
};

function isNotificationCode(value: string): value is StaffNotificationCode {
  return STAFF_NOTIFICATION_DEFINITIONS.some(
    (definition) => definition.code === value,
  );
}

function isMissingRelation(message: string): boolean {
  return /does not exist|schema cache|could not find/i.test(message);
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
}): Promise<Omit<StaffNotificationDeliveryResult, "eventId" | "eventKey" | "code">> {
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

async function loadRecordedDeliveryStaffIds(
  eventId: string,
): Promise<Set<string>> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("staff_notification_email_deliveries")
    .select("staff_id")
    .eq("event_id", eventId);

  if (error) {
    if (error.code === "42P01" || isMissingRelation(error.message)) {
      return new Set();
    }
    throw new Error(error.message);
  }

  return new Set(
    ((data ?? []) as Array<{ staff_id: string }>).map((row) => row.staff_id),
  );
}

async function recordEmailDelivery(
  eventId: string,
  staffId: string,
  status: "sent" | "failed",
  detail: { error?: string; resendId?: string | null },
): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin.from("staff_notification_email_deliveries").upsert(
    {
      event_id: eventId,
      staff_id: staffId,
      status,
      error: detail.error ?? null,
      resend_id: detail.resendId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id,staff_id" },
  );

  if (error) {
    console.error(
      "[staff-notifications] Failed to record email delivery:",
      error,
    );
  }
}

async function loadEventRow(eventId: string): Promise<NotificationEventRow | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("staff_notification_events")
    .select(
      "id, event_key, code, order_id, approval_id, title, description, href, payload",
    )
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) return null;
    throw new Error(error.message);
  }

  return (data as NotificationEventRow | null) ?? null;
}

async function loadOrderContent(orderId: string | null): Promise<OrderContentRow | null> {
  if (!orderId) return null;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("orders")
    .select("id, order_number, guest_name, cake_name, pickup_date")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) return null;
    throw new Error(error.message);
  }

  return (data as OrderContentRow | null) ?? null;
}

export async function deliverStaffNotificationEvent(input: {
  eventId: string;
  mailer?: StaffNotificationMailer;
}): Promise<StaffNotificationDeliveryResult | null> {
  const event = await loadEventRow(input.eventId);
  if (!event || !isNotificationCode(event.code)) return null;

  const empty: StaffNotificationDeliveryResult = {
    eventId: event.id,
    eventKey: event.event_key,
    code: event.code,
    attempted: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    const admin = createServiceClient();
    const { data: staffRows, error: staffError } = await admin
      .from("staff_profiles")
      .select("id, email, is_active")
      .eq("is_active", true);

    if (staffError) {
      throw new Error(staffError.message);
    }

    const staff = (staffRows ?? []) as Array<{
      id: string;
      email: string | null;
      is_active: boolean;
    }>;
    const staffIds = staff.map((row) => row.id);

    const preferencesByStaffId = new Map<
      string,
      Partial<Record<StaffNotificationCode, { emailEnabled: boolean }>>
    >();

    if (staffIds.length > 0) {
      const { data: preferenceRows, error: preferenceError } = await admin
        .from("staff_notification_preferences")
        .select("staff_id, notification_code, email_enabled")
        .eq("notification_code", event.code)
        .in("staff_id", staffIds);

      if (preferenceError) {
        throw new Error(preferenceError.message);
      }

      for (const row of (preferenceRows ?? []) as Array<{
        staff_id: string;
        notification_code: string;
        email_enabled: boolean;
      }>) {
        if (!isNotificationCode(row.notification_code)) continue;
        const current = preferencesByStaffId.get(row.staff_id) ?? {};
        current[row.notification_code] = {
          emailEnabled: Boolean(row.email_enabled),
        };
        preferencesByStaffId.set(row.staff_id, current);
      }
    }

    const recipients = selectStaffEmailRecipients({
      code: event.code,
      staff: staff.map((row) => ({
        id: row.id,
        email: row.email,
        isActive: row.is_active,
      })),
      preferencesByStaffId,
    });

    if (recipients.length === 0) {
      return empty;
    }

    const order = await loadOrderContent(event.order_id);
    const payload = event.payload ?? {};
    const delivered = await deliverStaffNotificationEmailsToRecipients({
      eventId: event.id,
      eventKey: event.event_key,
      content: {
        code: event.code,
        title: event.title,
        description: event.description,
        href: event.href,
        orderNumber:
          order?.order_number ?? payloadString(payload, "orderNumber"),
        customerName:
          order?.guest_name ?? payloadString(payload, "guestName"),
        cakeName: order?.cake_name ?? payloadString(payload, "cakeName"),
        pickupDate:
          order?.pickup_date ?? payloadString(payload, "pickupDate"),
        approvalRequestType: payloadString(payload, "requestType"),
      },
      recipients,
      alreadyDeliveredStaffIds: await loadRecordedDeliveryStaffIds(event.id),
      mailer: input.mailer ?? createResendStaffNotificationMailer(),
      recordDelivery: (staffId, status, detail) =>
        recordEmailDelivery(event.id, staffId, status, detail),
    });

    return {
      ...empty,
      ...delivered,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown dispatch error.";
    if (isMissingRelation(message)) {
      console.warn(
        "[staff-notifications] Dispatch skipped; notification tables are not applied yet.",
      );
      return empty;
    }
    console.error("[staff-notifications] Dispatch failed:", message);
    return {
      ...empty,
      failed: 1,
      errors: [message],
    };
  }
}

export async function deliverPendingStaffNotificationEmails(input?: {
  mailer?: StaffNotificationMailer;
  eventId?: string;
}): Promise<StaffNotificationDeliveryResult[]> {
  if (input?.eventId) {
    const result = await deliverStaffNotificationEvent({
      eventId: input.eventId,
      mailer: input.mailer,
    });
    return result ? [result] : [];
  }

  try {
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("staff_notification_events")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      if (isMissingRelation(error.message)) return [];
      throw new Error(error.message);
    }

    const results: StaffNotificationDeliveryResult[] = [];
    for (const row of (data ?? []) as Array<{ id: string }>) {
      const result = await deliverStaffNotificationEvent({
        eventId: row.id,
        mailer: input?.mailer,
      });
      if (result) results.push(result);
    }
    return results;
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
