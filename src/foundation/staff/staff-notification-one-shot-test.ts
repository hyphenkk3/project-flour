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

export type OneShotBlockedReason =
  | "deployment_not_allowed"
  | "provider_api_key_missing"
  | "provider_sender_missing"
  | "one_shot_audit_error"
  | "scope_check_error"
  | "scope_not_armed_or_gate_closed"
  | "claim_rpc_error"
  | "claim_result_mismatch"
  | "scope_check_error_after_claim"
  | "scope_not_current_before_recipient_processing"
  | "fresh_pick_check_error"
  | "fresh_pick_hold_not_current"
  | "scope_check_error_before_provider_authorization"
  | "scope_not_current_before_provider_authorization"
  | "provider_authorization_error"
  | "provider_authorization_denied";

type OneShotResult =
  | { outcome: "blocked"; reason: OneShotBlockedReason }
  | { outcome: "not_eligible" }
  | { outcome: "accepted"; providerRequestId: string | null }
  | { outcome: "unknown" };

type OneShotRpcResult = { data: unknown; error: boolean };
type OneShotRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<OneShotRpcResult>;

export type OneShotTestDependencies = {
  env?: NodeJS.ProcessEnv;
  rpc?: OneShotRpc;
  sendProvider?: (message: {
    to: string;
    subject: string;
    html: string;
    idempotencyKey: string;
  }) => Promise<{ id: string | null }>;
};

function isNotificationCode(value: string): value is StaffNotificationCode {
  return STAFF_NOTIFICATION_DEFINITIONS.some((item) => item.code === value);
}

const defaultRpc: OneShotRpc = async (name, args) => {
  try {
    const { data, error } = await createServiceClient().rpc(name, args);
    return { data, error: Boolean(error) };
  } catch {
    return { data: null, error: true };
  }
};

async function rpcBoolean(
  rpc: OneShotRpc,
  name: string,
  args: Record<string, unknown>,
): Promise<{ ok: true; value: boolean } | { ok: false }> {
  const result = await rpc(name, args);
  if (result.error) return { ok: false };
  return { ok: true, value: result.data === true };
}

async function recordAttempt(
  rpc: OneShotRpc,
  attempt: OneShotStaffNotificationAttempt,
  result: "accepted" | "unknown" | "blocked",
  detail?: { providerRequestId?: string | null; error?: string },
): Promise<void> {
  const { error } = await rpc(
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
  if (error) throw new Error("One-shot audit update failed.");
}

async function finalizeDelivery(input: {
  rpc: OneShotRpc;
  row: OneShotClaimRow;
  status: "sent" | "failed";
  error?: string;
  resendId?: string | null;
}): Promise<void> {
  const { error } = await input.rpc(
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
  if (error) throw new Error("One-shot delivery finalization failed.");
}

async function suppressDelivery(
  rpc: OneShotRpc,
  row: OneShotClaimRow,
  reason: string,
) {
  const { error } = await rpc("suppress_staff_notification_email_delivery", {
    p_event_id: row.event_id,
    p_staff_id: row.staff_id,
    p_reason: reason,
    p_claimed_until: row.claimed_until,
  });
  if (error) throw new Error("One-shot delivery suppression failed.");
}

async function recordBlockedAndSuppress(input: {
  rpc: OneShotRpc;
  attempt: OneShotStaffNotificationAttempt;
  row: OneShotClaimRow;
  auditReason: string;
  suppressionReason: string;
}): Promise<boolean> {
  let completed = true;
  try {
    await recordAttempt(input.rpc, input.attempt, "blocked", {
      error: input.auditReason,
    });
  } catch {
    completed = false;
  }
  try {
    await suppressDelivery(input.rpc, input.row, input.suppressionReason);
  } catch {
    completed = false;
  }
  return completed;
}

/** Executes only an already armed scope. It cannot create or extend one. */
export async function executeOneShotStaffNotificationEmailTest(
  input: {
    scopeId: string;
    eventId: string;
    staffId: string;
  },
  dependencies: OneShotTestDependencies = {},
): Promise<OneShotResult> {
  const env = dependencies.env ?? process.env;
  const configuredRpc = dependencies.rpc ?? defaultRpc;
  const rpc: OneShotRpc = async (name, args) => {
    try {
      return await configuredRpc(name, args);
    } catch {
      return { data: null, error: true };
    }
  };
  if (!isDevOneShotEmailTestEnvironment(env)) {
    return { outcome: "blocked", reason: "deployment_not_allowed" };
  }
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { outcome: "blocked", reason: "provider_api_key_missing" };
  }
  const from = env.RESEND_FROM?.trim();
  if (!from) {
    return { outcome: "blocked", reason: "provider_sender_missing" };
  }

  const scope = {
    p_scope_id: input.scopeId,
    p_event_id: input.eventId,
    p_staff_id: input.staffId,
  };

  const armed = await rpcBoolean(
    rpc,
    "staff_notification_email_test_scope_is_armed",
    scope,
  );
  if (!armed.ok) {
    return { outcome: "blocked", reason: "scope_check_error" };
  }
  if (!armed.value) {
    return {
      outcome: "blocked",
      reason: "scope_not_armed_or_gate_closed",
    };
  }

  const { data, error } = await rpc(
    "claim_staff_notification_email_test_delivery",
    scope,
  );
  if (error) return { outcome: "blocked", reason: "claim_rpc_error" };
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
    return { outcome: "blocked", reason: "claim_result_mismatch" };
  }

  const attempt: OneShotStaffNotificationAttempt = {
    scopeId: input.scopeId,
    eventId: input.eventId,
    staffId: input.staffId,
    deliveryId: row.delivery_id,
  };
  const isCurrent = () =>
    rpcBoolean(rpc, "staff_notification_email_test_scope_is_current", {
      ...scope,
      p_delivery_id: row.delivery_id,
    });

  const currentBeforeRecipient = await isCurrent();
  if (!currentBeforeRecipient.ok) {
    const recorded = await recordBlockedAndSuppress({
      rpc,
      attempt,
      row,
      auditReason: "One-shot scope check failed after claim.",
      suppressionReason: "One-shot scope check failed after claim.",
    });
    return {
      outcome: "blocked",
      reason: recorded
        ? "scope_check_error_after_claim"
        : "one_shot_audit_error",
    };
  }
  if (!currentBeforeRecipient.value) {
    const recorded = await recordBlockedAndSuppress({
      rpc,
      attempt,
      row,
      auditReason:
        "One-shot scope was not current before recipient processing.",
      suppressionReason:
        "One-shot scope was not current before recipient processing.",
    });
    return {
      outcome: "blocked",
      reason: recorded
        ? "scope_not_current_before_recipient_processing"
        : "one_shot_audit_error",
    };
  }

  if (row.code === "fresh_pick_walk_in_hold_reminder") {
    const { data: holdIsCurrent, error: holdError } = await rpc(
      "staff_notification_fresh_pick_hold_reminder_is_current",
      { p_payload: row.payload },
    );
    if (holdError || holdIsCurrent !== true) {
      const recorded = await recordBlockedAndSuppress({
        rpc,
        attempt,
        row,
        auditReason: holdError
          ? "Fresh Pick hold validation failed."
          : "Fresh Pick hold is no longer current.",
        suppressionReason: "One-shot Fresh Pick validation did not pass.",
      });
      return {
        outcome: "blocked",
        reason: !recorded
          ? "one_shot_audit_error"
          : holdError
            ? "fresh_pick_check_error"
            : "fresh_pick_hold_not_current",
      };
    }
  }

  const currentBeforeAuthorization = await isCurrent();
  if (!currentBeforeAuthorization.ok) {
    const recorded = await recordBlockedAndSuppress({
      rpc,
      attempt,
      row,
      auditReason: "One-shot scope check failed before provider authorization.",
      suppressionReason:
        "One-shot scope check failed before provider authorization.",
    });
    return {
      outcome: "blocked",
      reason: recorded
        ? "scope_check_error_before_provider_authorization"
        : "one_shot_audit_error",
    };
  }
  if (!currentBeforeAuthorization.value) {
    const recorded = await recordBlockedAndSuppress({
      rpc,
      attempt,
      row,
      auditReason:
        "One-shot scope was not current before provider authorization.",
      suppressionReason:
        "One-shot scope was not current before provider authorization.",
    });
    return {
      outcome: "blocked",
      reason: recorded
        ? "scope_not_current_before_provider_authorization"
        : "one_shot_audit_error",
    };
  }

  let orderNumber: string | null = null;
  let customerName: string | null = null;
  let pickupDate: string | null = null;
  if (row.order_id) {
    const { data: order } = await createServiceClient()
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
    environmentIsDev: () => isDevOneShotEmailTestEnvironment(env),
    apiKey,
    from,
    sendProvider: dependencies.sendProvider,
    authorize: async (authorizedAttempt) => {
      const authorized = await rpcBoolean(
        rpc,
        "authorize_staff_notification_email_test_provider_attempt",
        {
          p_scope_id: authorizedAttempt.scopeId,
          p_event_id: authorizedAttempt.eventId,
          p_staff_id: authorizedAttempt.staffId,
          p_delivery_id: authorizedAttempt.deliveryId,
        },
      );
      if (!authorized.ok) {
        return { authorized: false, reason: "provider_authorization_error" };
      }
      return authorized.value
        ? { authorized: true }
        : { authorized: false, reason: "provider_authorization_denied" };
    },
    record: (authorizedAttempt, result, detail) =>
      recordAttempt(rpc, authorizedAttempt, result, detail),
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
      try {
        await suppressDelivery(
          rpc,
          row,
          "One-shot provider authorization was not granted.",
        );
      } catch {
        return { outcome: "blocked", reason: "one_shot_audit_error" };
      }
      const reason = sent.blockedReason;
      if (
        reason === "provider_api_key_missing" ||
        reason === "provider_sender_missing" ||
        reason === "one_shot_audit_error" ||
        reason === "provider_authorization_error" ||
        reason === "provider_authorization_denied"
      ) {
        return { outcome: "blocked", reason };
      }
      return { outcome: "blocked", reason: "deployment_not_allowed" };
    }
    try {
      await finalizeDelivery({
        rpc,
        row,
        status: "sent",
        resendId: sent.id ?? null,
      });
    } catch {
      console.error(
        "One-shot email was accepted but delivery row finalization failed.",
      );
    }
    return { outcome: "accepted", providerRequestId: sent.id ?? null };
  } catch (sendError: unknown) {
    if (
      typeof sendError === "object" &&
      sendError !== null &&
      "blockedReason" in sendError
    ) {
      const reason = sendError.blockedReason;
      if (
        reason === "provider_api_key_missing" ||
        reason === "provider_sender_missing" ||
        reason === "one_shot_audit_error" ||
        reason === "provider_authorization_error" ||
        reason === "provider_authorization_denied"
      ) {
        return { outcome: "blocked", reason };
      }
    }
    try {
      await finalizeDelivery({
        rpc,
        row,
        status: "failed",
        error: "One-shot attempt outcome is not retryable; result is unknown.",
      });
    } catch {
      console.error("Could not finalize one-shot delivery state.");
    }
    return { outcome: "unknown" };
  }
}
