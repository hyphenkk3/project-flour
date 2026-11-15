import { NextResponse } from "next/server";

import { getSessionStaff } from "@/foundation/auth/session";
import { LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED } from "@/foundation/staff/legacy-staff-notification-email-pause";
import { deliverPendingStaffPushNotifications } from "@/foundation/staff/staff-notification-push-dispatch";
import { createServiceClient } from "@/lib/supabase/admin";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  DEV_PUSH_ACCEPTANCE_COOKIE,
  DEV_PUSH_ACCEPTANCE_COOKIE_MAX_AGE_SECONDS,
  DEV_PUSH_ACCEPTANCE_EVENT_KEY,
  DEV_PUSH_ACCEPTANCE_TARGET,
  authorizeMasterOwner,
  deploymentArmValue,
  inspectDeploymentIdentity,
  isDeploymentArmed,
  runOneShotAcceptance,
  validateActionBody,
  validateDeploymentConfirmation,
  validatePreflightSnapshot,
  validateRequestOrigin,
} from "@/foundation/staff/dev-push-acceptance-core.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXPECTED_AUDIENCE = Object.freeze({
  activeStaff: 7,
  newOrderWeb: 7,
  newOrderSound: 1,
  newOrderPushStaff: 1,
  ownerSubscriptions: 3,
});
const FRESH_PICK_REMINDER_CODE = "fresh_pick_walk_in_hold_reminder";

function jsonError(code: string, status: number) {
  return NextResponse.json(
    { ok: false, code },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function vapidConfigurationPresent() {
  return (
    /^[A-Za-z0-9_-]{80,100}$/.test(
      process.env.NEXT_PUBLIC_STAFF_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "",
    ) &&
    /^[A-Za-z0-9_-]{40,60}$/.test(
      process.env.STAFF_PUSH_VAPID_PRIVATE_KEY?.trim() ?? "",
    ) &&
    /^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/i.test(
      process.env.STAFF_PUSH_VAPID_SUBJECT?.trim() ?? "",
    )
  );
}

async function readOnlyPreflight(ownerStaffId: string) {
  const configuredUrl = getSupabaseEnv().url.replace(/\/$/, "");
  if (configuredUrl !== DEV_PUSH_ACCEPTANCE_TARGET.supabaseUrl) {
    return { ok: false as const, code: "wrong_dev_supabase" };
  }

  const admin = createServiceClient();
  const { data: profiles, error: profilesError } = await admin
    .from("staff_profiles")
    .select("id,is_active,archived_at,is_master_owner,roles!inner(code)")
    .eq("is_active", true)
    .is("archived_at", null);
  if (profilesError || !profiles) {
    return { ok: false as const, code: "staff_audience_unavailable" };
  }

  const activeProfiles = profiles as Array<{
    id: string;
    is_master_owner: boolean;
    roles: { code: string } | { code: string }[];
  }>;
  const owners = activeProfiles.filter((profile) => {
    const role = Array.isArray(profile.roles)
      ? profile.roles[0]
      : profile.roles;
    return profile.is_master_owner === true && role?.code === "owner";
  });
  if (
    activeProfiles.length !== EXPECTED_AUDIENCE.activeStaff ||
    owners.length !== 1 ||
    owners[0]?.id !== ownerStaffId
  ) {
    return { ok: false as const, code: "staff_audience_changed" };
  }

  const activeStaffIds = activeProfiles.map((profile) => profile.id);
  const { data: preferences, error: preferencesError } = await admin
    .from("staff_notification_preferences")
    .select("staff_id,notification_code,web_enabled,sound_enabled,push_enabled")
    .in("staff_id", activeStaffIds)
    .in("notification_code", ["new_order", FRESH_PICK_REMINDER_CODE]);
  if (preferencesError || !preferences) {
    return { ok: false as const, code: "notification_preferences_unavailable" };
  }

  const newOrderPreferences = preferences.filter(
    (row) => row.notification_code === "new_order",
  );
  const freshPickPreferences = preferences.filter(
    (row) => row.notification_code === FRESH_PICK_REMINDER_CODE,
  );
  if (
    newOrderPreferences.length !== EXPECTED_AUDIENCE.activeStaff ||
    freshPickPreferences.length !== EXPECTED_AUDIENCE.activeStaff
  ) {
    return { ok: false as const, code: "notification_preferences_incomplete" };
  }
  const ownerPreference = newOrderPreferences.find(
    (row) => row.staff_id === ownerStaffId,
  );
  const pushEligible = newOrderPreferences.filter(
    (row) => row.push_enabled === true,
  );
  const freshPickPushEligible = freshPickPreferences.filter(
    (row) => row.push_enabled === true,
  );
  if (
    !ownerPreference ||
    ownerPreference.web_enabled !== true ||
    newOrderPreferences.filter((row) => row.web_enabled === true).length !==
      EXPECTED_AUDIENCE.newOrderWeb ||
    newOrderPreferences.filter((row) => row.sound_enabled === true).length !==
      EXPECTED_AUDIENCE.newOrderSound ||
    pushEligible.length !== EXPECTED_AUDIENCE.newOrderPushStaff ||
    pushEligible[0]?.staff_id !== ownerStaffId ||
    freshPickPushEligible.length !== 0
  ) {
    return { ok: false as const, code: "notification_audience_changed" };
  }

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("staff_notification_push_subscriptions")
    .select("id,staff_id,expiration_time,revoked_at")
    .is("revoked_at", null);
  if (subscriptionsError || !subscriptions) {
    return { ok: false as const, code: "push_subscriptions_unavailable" };
  }
  const now = Date.now();
  const subscriptionsCurrent = subscriptions.every((subscription) => {
    if (
      subscription.staff_id !== ownerStaffId ||
      subscription.revoked_at !== null
    ) {
      return false;
    }
    if (subscription.expiration_time === null) return true;
    const expiry = Date.parse(subscription.expiration_time);
    return Number.isFinite(expiry) && expiry > now + 5 * 60 * 1000;
  });
  if (
    subscriptions.length !== EXPECTED_AUDIENCE.ownerSubscriptions ||
    !subscriptionsCurrent
  ) {
    return { ok: false as const, code: "push_subscription_audience_changed" };
  }

  const { count: queuedCount, error: queueError } = await admin
    .from("staff_notification_push_deliveries")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "claimed", "failed"]);
  if (queueError || queuedCount !== 0) {
    return { ok: false as const, code: "push_delivery_queue_not_empty" };
  }

  const { data: dispatchConfig, error: dispatchConfigError } = await admin
    .from("staff_notification_dispatch_config")
    .select("dispatch_url,per_event_enabled")
    .eq("id", true)
    .maybeSingle();
  if (
    dispatchConfigError ||
    !dispatchConfig ||
    dispatchConfig.per_event_enabled !== false ||
    (dispatchConfig.dispatch_url ?? "").trim() !== ""
  ) {
    return {
      ok: false as const,
      code: "automatic_event_dispatch_not_disabled",
    };
  }

  const { data: existingEvent, error: eventError } = await admin
    .from("staff_notification_events")
    .select("id")
    .eq("event_key", DEV_PUSH_ACCEPTANCE_EVENT_KEY)
    .maybeSingle();
  if (eventError || existingEvent) {
    return { ok: false as const, code: "fixed_event_key_unavailable" };
  }

  if (!vapidConfigurationPresent()) {
    return {
      ok: false as const,
      code: "push_provider_configuration_unavailable",
    };
  }
  if (!LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED) {
    return { ok: false as const, code: "email_must_remain_paused" };
  }

  return {
    ok: true as const,
    snapshot: {
      serviceRoleReadSucceeded: true,
      dispatchConfigDisabled: true,
      emailDispatchPaused: true,
      freshPickPushOff: true,
      audienceMatches: true,
      ownerSubscriptionsOnly: true,
      subscriptionsCurrent: true,
      deliveryQueueEmpty: true,
      fixedEventKeyAbsent: true,
      vapidConfigurationPresent: true,
    },
  };
}

export async function POST(request: Request) {
  const identity = inspectDeploymentIdentity(process.env);
  if (!identity.ok) return jsonError(identity.code, 403);
  const origin = validateRequestOrigin({
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    requestUrl: request.url,
    identity,
  });
  if (!origin.ok) return jsonError(origin.code, 403);

  const session = await getSessionStaff();
  const authorization = authorizeMasterOwner(session);
  if (!authorization.ok) {
    const status = authorization.code === "authentication_required" ? 401 : 403;
    return jsonError(authorization.code, status);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError("invalid_request", 400);
  }
  const body = validateActionBody(rawBody);
  if (!body.ok) return jsonError(body.code, 400);
  const deploymentConfirmation = validateDeploymentConfirmation(body, identity);
  if (!deploymentConfirmation.ok) {
    return jsonError("deployment_confirmation_mismatch", 409);
  }

  const preflight = await readOnlyPreflight(session!.id).catch(() => ({
    ok: false as const,
    code: "preflight_unavailable",
  }));
  if (!preflight.ok) return jsonError(preflight.code, 409);
  if (!validatePreflightSnapshot(preflight.snapshot).ok) {
    return jsonError("preflight_safety_gate_failed", 409);
  }

  const response = NextResponse.json(
    {
      ok: true,
      action: body.action,
      deploymentId: identity.deploymentId,
      commitSha: identity.commitSha,
      audience: EXPECTED_AUDIENCE,
      ...(body.action === "execute" ? { eventId: null } : {}),
    },
    { headers: { "cache-control": "no-store" } },
  );

  if (body.action === "arm") {
    response.cookies.set(
      DEV_PUSH_ACCEPTANCE_COOKIE,
      deploymentArmValue(identity) ?? "",
      {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: DEV_PUSH_ACCEPTANCE_COOKIE_MAX_AGE_SECONDS,
      },
    );
    return response;
  }

  const cookieValue = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEV_PUSH_ACCEPTANCE_COOKIE}=`))
    ?.slice(DEV_PUSH_ACCEPTANCE_COOKIE.length + 1);
  if (!isDeploymentArmed(cookieValue, identity)) {
    const notArmed = jsonError("deployment_action_not_armed", 409);
    notArmed.cookies.set(DEV_PUSH_ACCEPTANCE_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return notArmed;
  }

  const result = await runOneShotAcceptance({
    preflight: async () => {
      const current = await readOnlyPreflight(session!.id);
      if (!current.ok) return current;
      return validatePreflightSnapshot(current.snapshot);
    },
    createEvent: async (payload) => {
      const admin = createServiceClient();
      const { data, error } = await admin.rpc(
        "emit_staff_notification_event",
        payload,
      );
      if (error) throw new Error("event_creation_unavailable");
      return data;
    },
    dispatch: async (eventId) =>
      deliverPendingStaffPushNotifications({
        eventId,
        failClosed: true,
        preserveSubscriptions: true,
      }),
    log: (record) => console.info("[dev-push-acceptance]", record),
  });

  const finalResponse = NextResponse.json(
    {
      attemptCompleted: result.result === "dispatch_returned",
      result: result.result,
      code: result.code,
      eventId: result.eventId,
      dispatch:
        result.result === "dispatch_returned" ? result.dispatch : undefined,
    },
    {
      status: result.result === "dispatch_returned" ? 200 : 409,
      headers: { "cache-control": "no-store" },
    },
  );
  finalResponse.cookies.set(DEV_PUSH_ACCEPTANCE_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return finalResponse;
}
