// @ts-check

export const DEV_PUSH_ACCEPTANCE_TARGET = Object.freeze({
  projectId: "prj_3rmlAQzLSFOi15DEGczSuDYDq8xr",
  projectRef: "tzwtpxdcggesgjaqxkqr",
  supabaseUrl: "https://tzwtpxdcggesgjaqxkqr.supabase.co",
  gitBranch: "codex/staff-notifications-dev-20261109",
  branchHost:
    "project-flour-git-codex-staff-notifications-d-b89c48-hyphen-org.vercel.app",
});

export const DEV_PUSH_ACCEPTANCE_COOKIE = "__Host-dev-push-acceptance-arm";
export const DEV_PUSH_ACCEPTANCE_COOKIE_MAX_AGE_SECONDS = 300;
export const DEV_PUSH_ACCEPTANCE_EVENT_KEY =
  "staff-push-acceptance:tranche2:iphone-one-shot-v1";
export const DEV_PUSH_ACCEPTANCE_CORRELATION =
  "staff-push-acceptance:tranche2:iphone-one-shot-v1";

const CONFIRMATION_KEYS = Object.freeze([
  "devWebAudienceAccepted",
  "threeOwnerSubscriptionsAccountedFor",
  "iphonePermissionAndForceCloseReady",
  "freshPickScheduleVerifiedDisabled",
  "freshPickPushVerifiedOff",
  "pushBatchRetryScheduleDisabled",
  "emailVerifiedFrozen",
]);

const EVENT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEPLOYMENT_ID_PATTERN = /^dpl_[A-Za-z0-9]+$/;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;

/** @param {unknown} value */
function isNonNegativeSafeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ok: false, code: string} | {ok: true, deploymentId: string, commitSha: string, host: string}}
 */
export function inspectDeploymentIdentity(env) {
  const host = (env.VERCEL_BRANCH_URL ?? "").trim().toLowerCase();
  const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  const deploymentId = env.VERCEL_DEPLOYMENT_ID ?? "";
  const commitSha = env.VERCEL_GIT_COMMIT_SHA ?? "";
  const projectMatches =
    env.VERCEL === "1" &&
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_PROJECT_ID === DEV_PUSH_ACCEPTANCE_TARGET.projectId &&
    env.VERCEL_GIT_COMMIT_REF === DEV_PUSH_ACCEPTANCE_TARGET.gitBranch &&
    DEPLOYMENT_ID_PATTERN.test(deploymentId) &&
    COMMIT_SHA_PATTERN.test(commitSha) &&
    host === DEV_PUSH_ACCEPTANCE_TARGET.branchHost &&
    supabaseUrl === DEV_PUSH_ACCEPTANCE_TARGET.supabaseUrl;

  if (!projectMatches) return { ok: false, code: "deployment_not_approved" };
  return { ok: true, deploymentId, commitSha: commitSha.toLowerCase(), host };
}

/**
 * @param {{ host?: string | null, origin?: string | null, requestUrl?: string, identity: ReturnType<typeof inspectDeploymentIdentity> }} input
 * @returns {{ok: false, code: string} | {ok: true}}
 */
export function validateRequestOrigin(input) {
  if (!input.identity.ok) return { ok: false, code: "deployment_not_approved" };
  const host = (input.host ?? "").trim().toLowerCase();
  const origin = (input.origin ?? "").trim();
  if (
    host !== input.identity.host ||
    origin !== `https://${input.identity.host}`
  ) {
    return { ok: false, code: "same_origin_required" };
  }
  try {
    if (
      new URL(input.requestUrl ?? "").origin !==
      `https://${input.identity.host}`
    ) {
      return { ok: false, code: "same_origin_required" };
    }
  } catch {
    return { ok: false, code: "same_origin_required" };
  }
  return { ok: true };
}

/**
 * @param {{ isActive?: boolean, archivedAt?: string | null, isMasterOwner?: boolean, role?: { code?: string }, mustChangePassword?: boolean } | null} actor
 * @returns {{ok: false, code: string} | {ok: true}}
 */
export function authorizeMasterOwner(actor) {
  if (!actor) return { ok: false, code: "authentication_required" };
  if (actor.isActive !== true || actor.archivedAt) {
    return { ok: false, code: "active_staff_required" };
  }
  if (actor.mustChangePassword === true) {
    return { ok: false, code: "password_change_required" };
  }
  if (actor.isMasterOwner !== true || actor.role?.code !== "owner") {
    return { ok: false, code: "master_owner_required" };
  }
  return { ok: true };
}

/**
 * @param {unknown} body
 * @returns {{ok: false, code: string} | {ok: true, action: "arm" | "execute", deploymentId: string, commitSha: string, confirmations: Record<string, true>}}
 */
export function validateActionBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, code: "invalid_request" };
  }
  const value = /** @type {Record<string, unknown>} */ (body);
  const allowed = ["action", "deploymentId", "commitSha", "confirmations"];
  if (Object.keys(value).sort().join("|") !== allowed.sort().join("|")) {
    return { ok: false, code: "invalid_request" };
  }
  if (value.action !== "arm" && value.action !== "execute") {
    return { ok: false, code: "invalid_request" };
  }
  if (
    typeof value.deploymentId !== "string" ||
    !DEPLOYMENT_ID_PATTERN.test(value.deploymentId) ||
    typeof value.commitSha !== "string" ||
    !COMMIT_SHA_PATTERN.test(value.commitSha)
  ) {
    return { ok: false, code: "invalid_request" };
  }
  if (
    !value.confirmations ||
    typeof value.confirmations !== "object" ||
    Array.isArray(value.confirmations)
  ) {
    return { ok: false, code: "confirmations_required" };
  }
  const confirmations = /** @type {Record<string, unknown>} */ (
    value.confirmations
  );
  if (
    Object.keys(confirmations).sort().join("|") !==
      [...CONFIRMATION_KEYS].sort().join("|") ||
    CONFIRMATION_KEYS.some((key) => confirmations[key] !== true)
  ) {
    return { ok: false, code: "confirmations_required" };
  }
  return {
    ok: true,
    action: value.action,
    deploymentId: value.deploymentId,
    commitSha: value.commitSha.toLowerCase(),
    confirmations: /** @type {Record<string, true>} */ (confirmations),
  };
}

/**
 * @param {ReturnType<typeof inspectDeploymentIdentity>} identity
 * @returns {string | null}
 */
export function deploymentArmValue(identity) {
  if (!identity.ok) return null;
  return `${identity.deploymentId}.${identity.commitSha}`;
}

/** @param {string | undefined} value @param {ReturnType<typeof inspectDeploymentIdentity>} identity */
export function isDeploymentArmed(value, identity) {
  const expected = deploymentArmValue(identity);
  return Boolean(expected && value && value === expected);
}

/** @param {{deploymentId: string, commitSha: string}} confirmation @param {ReturnType<typeof inspectDeploymentIdentity>} identity */
export function validateDeploymentConfirmation(confirmation, identity) {
  if (
    !identity.ok ||
    confirmation.deploymentId !== identity.deploymentId ||
    confirmation.commitSha.toLowerCase() !== identity.commitSha
  ) {
    return { ok: false, code: "deployment_confirmation_mismatch" };
  }
  return { ok: true };
}

export function makeFixedSyntheticEvent() {
  return Object.freeze({
    p_event_key: DEV_PUSH_ACCEPTANCE_EVENT_KEY,
    p_code: "new_order",
    p_order_id: null,
    p_approval_id: null,
    p_title: "DEV TEST — NOT A REAL ORDER",
    p_description:
      "Synthetic DEV New Order notification for Push acceptance; no real order.",
    p_href: "/owner/orders",
    p_payload: {
      synthetic: true,
      purpose: "push-device-acceptance",
      correlation: DEV_PUSH_ACCEPTANCE_CORRELATION,
    },
  });
}

/** @param {unknown} value @returns {value is string} */
function isEventUuid(value) {
  return typeof value === "string" && EVENT_UUID_PATTERN.test(value);
}

/**
 * Single-attempt orchestration. RPC and dispatch exceptions are treated as
 * ambiguous: no automatic retry or replacement event is attempted.
 *
 * @param {{ preflight: () => Promise<{ ok: boolean, code?: string }>, createEvent: (payload: ReturnType<typeof makeFixedSyntheticEvent>) => Promise<unknown>, dispatch: (eventId: string) => Promise<unknown>, log?: (record: Record<string, unknown>) => void }} deps
 */
export async function runOneShotAcceptance(deps) {
  const correlation = DEV_PUSH_ACCEPTANCE_CORRELATION;
  let preflight;
  try {
    preflight = await deps.preflight();
  } catch {
    safeLog(deps.log, { correlation, result: "preflight_unavailable" });
    return { result: "stopped", code: "preflight_unavailable", eventId: null };
  }
  if (!preflight?.ok) {
    const code =
      typeof preflight?.code === "string"
        ? preflight.code
        : "preflight_blocked";
    safeLog(deps.log, { correlation, result: "preflight_blocked", code });
    return { result: "stopped", code, eventId: null };
  }

  let createdEventId;
  try {
    createdEventId = await deps.createEvent(makeFixedSyntheticEvent());
  } catch {
    safeLog(deps.log, { correlation, result: "event_creation_ambiguous" });
    return {
      result: "stopped",
      code: "event_creation_ambiguous",
      eventId: null,
    };
  }
  if (!isEventUuid(createdEventId)) {
    safeLog(deps.log, {
      correlation,
      result: "event_not_created_or_duplicate",
    });
    return {
      result: "stopped",
      code: "event_not_created_or_duplicate",
      eventId: null,
    };
  }

  const eventId = createdEventId.toLowerCase();
  safeLog(deps.log, { correlation, result: "event_created", eventId });
  let dispatchResult;
  try {
    dispatchResult = await deps.dispatch(eventId);
  } catch {
    safeLog(deps.log, { correlation, result: "dispatch_ambiguous", eventId });
    return { result: "stopped", code: "dispatch_ambiguous", eventId };
  }

  const dispatchRecord =
    dispatchResult && typeof dispatchResult === "object"
      ? /** @type {Record<string, unknown>} */ (dispatchResult)
      : {};
  const httpStatus = dispatchRecord.httpStatus ?? dispatchRecord.status;
  if (httpStatus === 503) {
    safeLog(deps.log, {
      correlation,
      result: "dispatch_ambiguous_503",
      eventId,
    });
    return { result: "stopped", code: "dispatch_ambiguous_503", eventId };
  }

  if (
    !isNonNegativeSafeInteger(dispatchRecord.queued) ||
    !isNonNegativeSafeInteger(dispatchRecord.attempted) ||
    !isNonNegativeSafeInteger(dispatchRecord.sent) ||
    !isNonNegativeSafeInteger(dispatchRecord.failed) ||
    !isNonNegativeSafeInteger(dispatchRecord.revoked) ||
    !isNonNegativeSafeInteger(dispatchRecord.suppressed) ||
    !isNonNegativeSafeInteger(dispatchRecord.completionUnrecorded) ||
    dispatchRecord.skipped !== null
  ) {
    safeLog(deps.log, {
      correlation,
      result: "dispatch_response_ambiguous",
      eventId,
    });
    return { result: "stopped", code: "dispatch_response_ambiguous", eventId };
  }

  const summary = sanitizeDispatchSummary(dispatchResult);
  safeLog(deps.log, {
    correlation,
    result: "dispatch_returned",
    eventId,
    ...summary,
  });
  return {
    result: "dispatch_returned",
    code: null,
    eventId,
    dispatch: summary,
  };
}

/** @param {unknown} result @returns {Record<string, string | number>} */
function sanitizeDispatchSummary(result) {
  if (!result || typeof result !== "object") return { outcome: "unknown" };
  const value = /** @type {Record<string, unknown>} */ (result);
  /** @type {Record<string, string | number>} */
  const summary = {};
  for (const key of [
    "queued",
    "attempted",
    "sent",
    "failed",
    "revoked",
    "suppressed",
    "completionUnrecorded",
  ]) {
    if (Number.isInteger(value[key]) && Number(value[key]) >= 0)
      summary[key] = Number(value[key]);
  }
  if (value.skipped === "not_configured") summary.skipped = value.skipped;
  return Object.keys(summary).length ? summary : { outcome: "unknown" };
}

/** @param {((record: Record<string, unknown>) => void) | undefined} logger @param {Record<string, unknown>} record */
function safeLog(logger, record) {
  if (!logger) return;
  try {
    logger(record);
  } catch {
    // Logging failure cannot repeat or alter the one-shot operation.
  }
}

/** @param {unknown} snapshot */
export function validatePreflightSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object")
    return { ok: false, code: "preflight_unavailable" };
  const value = /** @type {Record<string, unknown>} */ (snapshot);
  const requiredTrue = [
    "serviceRoleReadSucceeded",
    "dispatchConfigDisabled",
    "emailDispatchPaused",
    "freshPickPushOff",
    "audienceMatches",
    "ownerSubscriptionsOnly",
    "subscriptionsCurrent",
    "deliveryQueueEmpty",
    "fixedEventKeyAbsent",
    "vapidConfigurationPresent",
  ];
  if (requiredTrue.some((key) => value[key] !== true)) {
    return { ok: false, code: "preflight_safety_gate_failed" };
  }
  return { ok: true };
}
