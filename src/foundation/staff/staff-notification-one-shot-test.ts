import { createServiceClient } from "@/lib/supabase/admin";
import {
  STAFF_NOTIFICATION_DEFINITIONS,
  type StaffNotificationCode,
} from "@/foundation/staff/notification-preferences";
import { buildStaffNotificationEmail } from "@/foundation/staff/staff-notification-email";
import { parseNewOrderNotificationPayload } from "@/foundation/staff/staff-notification-new-order";
import {
  createOneShotTestResendMailer,
  type OneShotStaffNotificationAttempt,
} from "@/foundation/staff/staff-notification-dispatch";

const DEV_PROJECT_REF = "tzwtpxdcggesgjaqxkqr";
const DEV_BRANCH = "debug/mobile-add-to-order-safari";

export function isDevOneShotEmailTestEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  let projectUrl: URL;
  try {
    if (!url) return false;
    projectUrl = new URL(url);
  } catch {
    return false;
  }

  return (
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_GIT_COMMIT_REF === DEV_BRANCH &&
    projectUrl.protocol === "https:" &&
    projectUrl.hostname === `${DEV_PROJECT_REF}.supabase.co`
  );
}

type OneShotClaimRow = {
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

type OneShotResult =
  | { outcome: "blocked" | "not_eligible" }
  | { outcome: "accepted"; providerRequestId: string | null }
  | { outcome: "unknown" };

function isNotificationCode(value: string): value is StaffNotificationCode {
  return STAFF_NOTIFICATION_DEFINITIONS.some((item) => item.code === value);
}

async function rpcBoolean(
  name: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await createServiceClient().rpc(name, args);
  return !error && data === true;
}

async function recordAttempt(
  attempt: OneShotStaffNotificationAttempt,
  result: "accepted" | "unknown" | "blocked",
  detail?: { providerRequestId?: string | null; error?: string },
): Promise<void> {
  const { error } = await createServiceClient().rpc(
    "complete_staff_notification_email_test_provider_attempt",
    {
      p_scope_id: attempt.scopeId,
      p_event_id: attempt.eventId,
      p_staff_id: attempt.staffId,
      p_result: result,
      p_provider_request_id: detail?.providerRequestId ?? null,
      p_error: detail?.error ?? null,
    },
  );
  if (error) throw new Error(error.message);
}

async function finalizeDelivery(input: {
  row: OneShotClaimRow;
  status: "sent" | "failed";
  error?: string;
  resendId?: string | null;
}): Promise<void> {
  const { error } = await createServiceClient().rpc(
    "complete_staff_notification_email_delivery",
    {
      p_event_id: input.row.event_id,
      p_staff_id: input.row.staff_id,
      p_status: input.status,
      p_error: input.error ?? null,
      p_resend_id: input.resendId ?? null,
      p_claimed_until: input.row.claimed_until,
    },
  );
  if (error) throw new Error(error.message);
}

async function suppressDelivery(row: OneShotClaimRow, reason: string) {
  const { error } = await createServiceClient().rpc(
    "suppress_staff_notification_email_delivery",
    {
      p_event_id: row.event_id,
      p_staff_id: row.staff_id,
      p_reason: reason,
      p_claimed_until: row.claimed_until,
    },
  );
  if (error) throw new Error(error.message);
}

/** Executes only an already armed scope. It cannot create or extend one. */
export async function executeOneShotStaffNotificationEmailTest(input: {
  scopeId: string;
  eventId: string;
  staffId: string;
}): Promise<OneShotResult> {
  if (
    !isDevOneShotEmailTestEnvironment() ||
    !process.env.RESEND_API_KEY?.trim()
  ) {
    return { outcome: "blocked" };
  }

  const admin = createServiceClient();
  const scope = {
    p_scope_id: input.scopeId,
    p_event_id: input.eventId,
    p_staff_id: input.staffId,
  };

  if (
    !(await rpcBoolean("staff_notification_email_test_scope_is_armed", scope))
  ) {
    return { outcome: "blocked" };
  }

  const { data, error } = await admin.rpc(
    "claim_staff_notification_email_test_delivery",
    scope,
  );
  if (error) return { outcome: "blocked" };
  const rows = (data ?? []) as OneShotClaimRow[];
  if (rows.length !== 1) return { outcome: "not_eligible" };

  const row = rows[0];
  if (
    !row ||
    row.event_id !== input.eventId ||
    row.staff_id !== input.staffId ||
    !isNotificationCode(row.code) ||
    !row.staff_email.trim()
  ) {
    return { outcome: "blocked" };
  }

  const attempt: OneShotStaffNotificationAttempt = {
    scopeId: input.scopeId,
    eventId: input.eventId,
    staffId: input.staffId,
    deliveryId: row.delivery_id,
  };
  const isCurrent = () =>
    rpcBoolean("staff_notification_email_test_scope_is_current", {
      ...scope,
      p_delivery_id: row.delivery_id,
    });

  if (!(await isCurrent())) {
    await recordAttempt(attempt, "blocked", {
      error:
        "One-shot scope expired or was shut down before recipient processing.",
    });
    await suppressDelivery(
      row,
      "One-shot scope was no longer current before recipient processing.",
    );
    return { outcome: "blocked" };
  }

  if (row.code === "fresh_pick_walk_in_hold_reminder") {
    const { data: holdIsCurrent, error: holdError } = await admin.rpc(
      "staff_notification_fresh_pick_hold_reminder_is_current",
      { p_payload: row.payload },
    );
    if (holdError || holdIsCurrent !== true) {
      await recordAttempt(attempt, "blocked", {
        error: "The exact Fresh Pick hold is no longer current.",
      });
      await suppressDelivery(
        row,
        "One-shot test Fresh Pick hold is no longer current.",
      );
      return { outcome: "blocked" };
    }
  }

  if (!(await isCurrent())) {
    await recordAttempt(attempt, "blocked", {
      error:
        "One-shot scope expired or was shut down before provider authorization.",
    });
    await suppressDelivery(
      row,
      "One-shot scope was no longer current before provider authorization.",
    );
    return { outcome: "blocked" };
  }

  let orderNumber: string | null = null;
  let customerName: string | null = null;
  let pickupDate: string | null = null;
  if (row.order_id) {
    const { data: order } = await admin
      .from("orders")
      .select("order_number, guest_name, pickup_date")
      .eq("id", row.order_id)
      .maybeSingle();
    orderNumber = order?.order_number ?? null;
    customerName = order?.guest_name ?? null;
    pickupDate = order?.pickup_date ?? null;
  }
  const payload = row.payload ?? {};
  const email = buildStaffNotificationEmail({
    code: row.code,
    title: row.title,
    description: row.description,
    href: row.href,
    orderNumber,
    customerName,
    pickupDate,
    cakeName: typeof payload.cakeName === "string" ? payload.cakeName : null,
    approvalRequestType:
      typeof payload.requestType === "string" ? payload.requestType : null,
    newOrder:
      row.code === "new_order"
        ? parseNewOrderNotificationPayload(payload)
        : null,
  });

  const mailer = createOneShotTestResendMailer({
    environmentIsDev: isDevOneShotEmailTestEnvironment,
    authorize: async (authorizedAttempt) =>
      rpcBoolean("authorize_staff_notification_email_test_provider_attempt", {
        p_scope_id: authorizedAttempt.scopeId,
        p_event_id: authorizedAttempt.eventId,
        p_staff_id: authorizedAttempt.staffId,
        p_delivery_id: authorizedAttempt.deliveryId,
      }),
    record: recordAttempt,
  });

  try {
    const sent = await mailer.send({
      to: row.staff_email,
      subject: email.subject,
      html: email.html,
      idempotencyKey: `${row.event_key}:${row.staff_id}:one-shot`,
      oneShot: attempt,
    });
    if (sent.skipped) {
      await suppressDelivery(
        row,
        "One-shot provider authorization was not granted.",
      );
      return { outcome: "blocked" };
    }
    try {
      await finalizeDelivery({
        row,
        status: "sent",
        resendId: sent.id ?? null,
      });
    } catch (finalizeError) {
      console.error(
        "One-shot email was accepted but delivery row finalization failed.",
        finalizeError,
      );
    }
    return { outcome: "accepted", providerRequestId: sent.id ?? null };
  } catch (sendError) {
    const detail =
      sendError instanceof Error
        ? sendError.message
        : "Unknown provider result.";
    try {
      await finalizeDelivery({
        row,
        status: "failed",
        error: `One-shot attempt outcome is not retryable: ${detail}`,
      });
    } catch (finalizeError) {
      console.error(
        "Could not finalize one-shot delivery state.",
        finalizeError,
      );
    }
    return { outcome: "unknown" };
  }
}
