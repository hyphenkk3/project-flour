#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export const TARGET = Object.freeze({
  projectRef: "tzwtpxdcggesgjaqxkqr",
  supabaseUrl: "https://tzwtpxdcggesgjaqxkqr.supabase.co",
  previewOrigin: "https://project-flour-11fjboq70-hyphen-org.vercel.app",
  deploymentId: "dpl_F1G2toWCkBZqnHaHah6Xennt95CD",
  sourceCommit: "d71128de4d71e4ab840c4156903ce014c648e57e",
  eventCode: "new_order",
});

const DEFAULT_JOURNAL = join(
  dirname(fileURLToPath(import.meta.url)),
  ".one-shot-dev-push-acceptance",
  "journal.json",
);
const EVENT_PATH = "/rest/v1/rpc/emit_staff_notification_event";
const DISPATCH_PATH = "/api/staff/notifications/dispatch";
const TIMEOUT_MS = 8_000;
const EXPECTED_AUDIENCE = Object.freeze({
  webEligible: 7,
  soundEligible: 1,
  pushEligibleStaff: 1,
  activeOwnerSubscriptions: 3,
});

export class RunnerError extends Error {
  constructor(code, safeEventId = null) {
    super(code);
    this.name = "RunnerError";
    this.code = code;
    this.safeEventId = safeEventId;
  }
}

function require(condition, code) {
  if (!condition) throw new RunnerError(code);
}

export function inspectEnvironment(env = process.env) {
  const url =
    typeof env.NEXT_PUBLIC_SUPABASE_URL === "string"
      ? env.NEXT_PUBLIC_SUPABASE_URL.trim().replace(/\/$/, "")
      : "";
  return {
    targetMatches: url === TARGET.supabaseUrl,
    serviceRolePresent: Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    dispatchSecretPresent: Boolean(
      env.STAFF_NOTIFICATION_DISPATCH_SECRET?.trim(),
    ),
    vercelPreviewAccessTokenPresent: Boolean(env.VERCEL_OIDC_TOKEN?.trim()),
    publicVapidShapeValid: /^[A-Za-z0-9_-]{80,100}$/.test(
      env.NEXT_PUBLIC_STAFF_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "",
    ),
    privateVapidShapeValid: /^[A-Za-z0-9_-]{40,60}$/.test(
      env.STAFF_PUSH_VAPID_PRIVATE_KEY?.trim() ?? "",
    ),
    subjectShapeValid: /^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/i.test(
      env.STAFF_PUSH_VAPID_SUBJECT?.trim() ?? "",
    ),
  };
}

function validateEnvironment(env) {
  const report = inspectEnvironment(env);
  require(report.targetMatches, "wrong_or_missing_dev_supabase_url");
  require(report.serviceRolePresent, "missing_service_role_credential");
  require(report.dispatchSecretPresent, "missing_dispatch_credential");
  require(report.vercelPreviewAccessTokenPresent, "missing_vercel_preview_access_token");
  require(report.publicVapidShapeValid &&
    report.privateVapidShapeValid &&
    report.subjectShapeValid, "missing_push_provider_configuration");
  return {
    supabaseUrl: TARGET.supabaseUrl,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY.trim(),
    dispatchSecret: env.STAFF_NOTIFICATION_DISPATCH_SECRET.trim(),
    vercelOidcToken: env.VERCEL_OIDC_TOKEN.trim(),
  };
}

function noRedirectFetch(fetchImpl, url, init) {
  return fetchImpl(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function safeJson(response, code) {
  try {
    return await response.json();
  } catch {
    throw new RunnerError(code);
  }
}

async function getRows({ fetchImpl, url, key, path }) {
  let response;
  try {
    response = await noRedirectFetch(fetchImpl, `${url}${path}`, {
      method: "GET",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        accept: "application/json",
      },
    });
  } catch {
    throw new RunnerError("readonly_dev_preflight_request_failed");
  }
  require(response.ok, `readonly_dev_preflight_http_${response.status}`);
  const body = await safeJson(response, "readonly_dev_preflight_invalid_json");
  require(Array.isArray(body), "readonly_dev_preflight_invalid_shape");
  return body;
}

function activeProfile(profile) {
  return profile.is_active === true && profile.archived_at == null;
}

function activeSubscription(subscription, now) {
  if (subscription.revoked_at != null) return false;
  if (subscription.expiration_time == null) return true;
  const expiresAt = Date.parse(subscription.expiration_time);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function summarizeAudience({
  profiles,
  preferences,
  subscriptions,
  now,
}) {
  const active = profiles.filter(activeProfile);
  const owners = active.filter((profile) => profile.is_master_owner === true);
  require(active.length === 7, "active_staff_audience_changed");
  require(owners.length === 1, "master_owner_count_changed");
  const preferenceByStaff = new Map(
    preferences.map((preference) => [preference.staff_id, preference]),
  );
  require(active.every((profile) =>
    preferenceByStaff.has(profile.id),
  ), "new_order_preference_rows_incomplete");
  const eligible = (field) =>
    active.filter(
      (profile) => preferenceByStaff.get(profile.id)[field] === true,
    );
  const pushEligible = eligible("push_enabled");
  require(pushEligible.length === 1 &&
    pushEligible[0].id === owners[0].id, "push_audience_not_owner_only");
  const activeOwnerSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription.staff_id === owners[0].id &&
      activeSubscription(subscription, now),
  );
  const result = {
    webEligible: eligible("web_enabled").length,
    soundEligible: eligible("sound_enabled").length,
    pushEligibleStaff: pushEligible.length,
    activeOwnerSubscriptions: activeOwnerSubscriptions.length,
  };
  require(Object.entries(EXPECTED_AUDIENCE).every(
    ([key, value]) => result[key] === value,
  ), "recipient_or_device_audience_changed");
  return result;
}

export async function runReadOnlyPreflight({
  env = process.env,
  fetchImpl = fetch,
  now = Date.now(),
}) {
  const secrets = validateEnvironment(env);
  let databaseProbe;
  try {
    databaseProbe = await noRedirectFetch(
      fetchImpl,
      `${TARGET.supabaseUrl}/rest/v1/staff_notification_push_subscriptions?select=id&limit=0`,
      {
        method: "HEAD",
        headers: {
          apikey: secrets.serviceRoleKey,
          authorization: `Bearer ${secrets.serviceRoleKey}`,
        },
      },
    );
  } catch {
    throw new RunnerError("dev_service_role_probe_failed");
  }
  require(databaseProbe.status === 200, "dev_service_role_probe_rejected");
  await databaseProbe.body?.cancel();

  let dispatchProbe;
  try {
    dispatchProbe = await noRedirectFetch(
      fetchImpl,
      `${TARGET.previewOrigin}${DISPATCH_PATH}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${secrets.dispatchSecret}`,
          "x-vercel-trusted-oidc-idp-token": secrets.vercelOidcToken,
        },
      },
    );
  } catch {
    throw new RunnerError("paused_dispatch_auth_probe_failed");
  }
  const dispatchAuthAccepted = dispatchProbe.status === 503;
  await dispatchProbe.body?.cancel();
  require(dispatchAuthAccepted, "paused_dispatch_auth_probe_rejected");

  const common = {
    fetchImpl,
    url: secrets.supabaseUrl,
    key: secrets.serviceRoleKey,
  };
  const [profiles, preferences, subscriptions, outstanding, config, urlConfig] =
    await Promise.all([
      getRows({
        ...common,
        path: "/rest/v1/staff_profiles?select=id,is_active,archived_at,is_master_owner",
      }),
      getRows({
        ...common,
        path: "/rest/v1/staff_notification_preferences?select=staff_id,web_enabled,sound_enabled,push_enabled&notification_code=eq.new_order",
      }),
      getRows({
        ...common,
        path: "/rest/v1/staff_notification_push_subscriptions?select=staff_id,revoked_at,expiration_time",
      }),
      getRows({
        ...common,
        path: "/rest/v1/staff_notification_push_deliveries?select=status&status=in.(pending,claimed,failed)",
      }),
      getRows({
        ...common,
        path: "/rest/v1/staff_notification_dispatch_config?select=email_dispatch_enabled,email_dispatch_test_mode,per_event_enabled&id=eq.true",
      }),
      getRows({
        ...common,
        path: "/rest/v1/staff_notification_dispatch_config?select=id&dispatch_url=not.is.null&dispatch_url=not.eq.",
      }),
    ]);
  require(outstanding.length === 0, "push_delivery_backlog_not_empty");
  require(config.length === 1, "dispatch_config_not_unique");
  require(config[0].email_dispatch_enabled === false &&
    config[0].email_dispatch_test_mode === false &&
    config[0].per_event_enabled === false &&
    urlConfig.length === 0, "dispatch_or_email_configuration_changed");
  const audience = summarizeAudience({
    profiles,
    preferences,
    subscriptions,
    now,
  });
  return {
    target: {
      projectRef: TARGET.projectRef,
      previewHost: new URL(TARGET.previewOrigin).host,
    },
    checks: {
      serviceRoleAcceptedByDev: true,
      dispatchSecretAcceptedByPausedPreview: true,
      emailDispatchDisabled: true,
      persistentPerEventDispatchDisabled: true,
      dispatchUrlAbsent: true,
      outstandingDeliveries: 0,
    },
    audience,
  };
}

export function makeSyntheticEvent({ eventKey, title, description, payload }) {
  require(typeof eventKey === "string" &&
    /^push-device-acceptance:[0-9]{8}T[0-9]{6}Z:[0-9a-f-]{36}$/i.test(
      eventKey,
    ), "invalid_synthetic_event_key");
  require(title === "[DEV SYNTHETIC PUSH ACCEPTANCE]" &&
    description ===
      "Synthetic staff notification test; no customer order.", "invalid_synthetic_event_copy");
  require(payload?.synthetic === true, "synthetic_marker_required");
  return {
    p_event_key: eventKey,
    p_code: TARGET.eventCode,
    p_order_id: null,
    p_approval_id: null,
    p_title: title,
    p_description: description,
    p_href: "/owner/orders",
    p_payload: payload,
  };
}

function extractEventId(body) {
  const candidate =
    typeof body === "string" ? body : Array.isArray(body) ? body[0] : null;
  return typeof candidate === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      candidate,
    )
    ? candidate
    : null;
}

function sanitizePushResults(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !value.push ||
    typeof value.push !== "object"
  ) {
    return null;
  }
  const keys = [
    "queued",
    "attempted",
    "sent",
    "failed",
    "revoked",
    "suppressed",
    "completionUnrecorded",
  ];
  const result = {};
  for (const key of keys) {
    const number = value.push[key];
    if (Number.isInteger(number) && number >= 0) result[key] = number;
  }
  if (value.push.skipped === "not_configured")
    result.skipped = value.push.skipped;
  return result;
}

async function readEventDeliveryStatuses({
  fetchImpl,
  supabaseUrl,
  serviceRoleKey,
  eventId,
}) {
  const rows = await getRows({
    fetchImpl,
    url: supabaseUrl,
    key: serviceRoleKey,
    path: `/rest/v1/staff_notification_push_deliveries?select=status&event_id=eq.${encodeURIComponent(eventId)}`,
  });
  const statuses = {
    pending: 0,
    claimed: 0,
    sent: 0,
    failed: 0,
    suppressed: 0,
    unknown: 0,
  };
  for (const row of rows) {
    if (Object.hasOwn(statuses, row.status)) statuses[row.status] += 1;
    else statuses.unknown += 1;
  }
  return statuses;
}

export function createFilesystemJournal(path = DEFAULT_JOURNAL) {
  return {
    async exists() {
      try {
        await lstat(path);
        return true;
      } catch (error) {
        if (error?.code === "ENOENT") return false;
        throw new RunnerError("journal_inspection_failed");
      }
    },
    async create(value) {
      try {
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        const dirStat = await lstat(dirname(path));
        require(dirStat.isDirectory() &&
          !dirStat.isSymbolicLink() &&
          (dirStat.mode & 0o077) === 0 &&
          (typeof process.getuid !== "function" ||
            dirStat.uid === process.getuid()), "journal_directory_not_private");
        const handle = await open(
          path,
          fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
          0o600,
        );
        try {
          await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
      } catch (error) {
        if (error?.code === "EEXIST")
          throw new RunnerError("one_shot_already_consumed");
        if (error instanceof RunnerError) throw error;
        throw new RunnerError("journal_create_failed");
      }
    },
    async update(value) {
      const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
      try {
        const handle = await open(
          tempPath,
          fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
          0o600,
        );
        try {
          await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(tempPath, path);
      } catch {
        try {
          await unlink(tempPath);
        } catch {
          /* best effort cleanup */
        }
        throw new RunnerError("journal_update_failed");
      }
    },
  };
}

function makeEventKey(now, uuid) {
  const timestamp = new Date(now)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  return `push-device-acceptance:${timestamp}:${uuid}`;
}

async function askForConfirmation({ confirm, eventKey }) {
  require(typeof confirm === "function", "interactive_confirmation_required");
  const phrase = `ACK: 7 New Order Web recipients (6 coordinated), all 3 Owner Push devices controlled, Owner Sound may alert, iPhone permission granted, installed app force-closed, one event only ${eventKey.slice(-8)}`;
  const accepted = await confirm(phrase);
  require(accepted === phrase, "operator_confirmation_not_matched");
}

export async function executeOneShot({
  env = process.env,
  fetchImpl = fetch,
  journal = createFilesystemJournal(),
  confirm,
  now = Date.now(),
  uuid = randomUUID,
}) {
  const secrets = validateEnvironment(env);
  const preflight = await runReadOnlyPreflight({ env, fetchImpl, now });
  require(!(await journal.exists()), "one_shot_already_consumed");
  const eventKey = makeEventKey(now, uuid());
  await askForConfirmation({ confirm, eventKey });
  let journalState = {
    target: TARGET.projectRef,
    previewHost: new URL(TARGET.previewOrigin).host,
    eventKey,
    eventCode: TARGET.eventCode,
    phase: "event_creation_started",
    createdAt: new Date(now).toISOString(),
  };
  await journal.create(journalState);

  const eventArgs = makeSyntheticEvent({
    eventKey,
    title: "[DEV SYNTHETIC PUSH ACCEPTANCE]",
    description: "Synthetic staff notification test; no customer order.",
    payload: {
      synthetic: true,
      purpose: "push-device-acceptance",
      correlation: eventKey,
    },
  });
  let eventResponse;
  try {
    eventResponse = await noRedirectFetch(
      fetchImpl,
      `${TARGET.supabaseUrl}${EVENT_PATH}`,
      {
        method: "POST",
        headers: {
          apikey: secrets.serviceRoleKey,
          authorization: `Bearer ${secrets.serviceRoleKey}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(eventArgs),
      },
    );
  } catch {
    journalState = { ...journalState, phase: "event_creation_ambiguous" };
    await journal.update(journalState);
    throw new RunnerError("event_creation_ambiguous_do_not_retry");
  }
  if (!eventResponse.ok) {
    await eventResponse.body?.cancel();
    journalState = { ...journalState, phase: "event_creation_rejected" };
    await journal.update(journalState);
    throw new RunnerError(
      `event_creation_rejected_http_${eventResponse.status}_do_not_retry`,
    );
  }
  const eventBody = await safeJson(
    eventResponse,
    "event_creation_response_ambiguous_do_not_retry",
  );
  const eventId = extractEventId(eventBody);
  if (!eventId) {
    journalState = { ...journalState, phase: "event_creation_ambiguous" };
    await journal.update(journalState);
    throw new RunnerError("event_creation_ambiguous_do_not_retry");
  }
  journalState = { ...journalState, eventId, phase: "event_created" };
  try {
    await journal.update(journalState);
  } catch {
    throw new RunnerError(
      "event_created_journal_persist_failed_do_not_dispatch",
      eventId,
    );
  }

  journalState = { ...journalState, phase: "dispatch_started" };
  await journal.update(journalState);
  let dispatchResponse;
  try {
    dispatchResponse = await noRedirectFetch(
      fetchImpl,
      `${TARGET.previewOrigin}${DISPATCH_PATH}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${secrets.dispatchSecret}`,
          "x-vercel-trusted-oidc-idp-token": secrets.vercelOidcToken,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ eventId }),
      },
    );
  } catch {
    journalState = { ...journalState, phase: "dispatch_ambiguous" };
    try {
      journalState = {
        ...journalState,
        deliveryStatuses: await readEventDeliveryStatuses({
          fetchImpl,
          supabaseUrl: secrets.supabaseUrl,
          serviceRoleKey: secrets.serviceRoleKey,
          eventId,
        }),
      };
    } catch {
      journalState = { ...journalState, deliveryStatusRead: "failed" };
    }
    await journal.update(journalState);
    throw new RunnerError("dispatch_ambiguous_do_not_retry", eventId);
  }
  const dispatchStatus = dispatchResponse.status;
  let responseBody = null;
  try {
    responseBody = await dispatchResponse.json();
  } catch {
    // An unreadable response is recorded as ambiguous; it is never retried.
  }
  const push = sanitizePushResults(responseBody);
  const phase =
    dispatchStatus === 503 && push
      ? "dispatch_processed_email_paused_503"
      : dispatchResponse.ok && push
        ? "dispatch_response_received"
        : "dispatch_ambiguous";
  try {
    journalState = {
      ...journalState,
      dispatchStatus,
      push,
      deliveryStatuses: await readEventDeliveryStatuses({
        fetchImpl,
        supabaseUrl: secrets.supabaseUrl,
        serviceRoleKey: secrets.serviceRoleKey,
        eventId,
      }),
      phase,
    };
  } catch {
    journalState = {
      ...journalState,
      dispatchStatus,
      push,
      deliveryStatusRead: "failed",
      phase,
    };
  }
  await journal.update(journalState);
  return {
    eventId,
    eventKey,
    dispatchStatus,
    push,
    deliveryStatuses: journalState.deliveryStatuses ?? null,
    phase,
    preflight: { audience: preflight.audience, checks: preflight.checks },
    retry: false,
  };
}

export function dryRunReport(env = process.env) {
  return {
    mode: "dry-run",
    target: {
      projectRef: TARGET.projectRef,
      previewOrigin: TARGET.previewOrigin,
      deploymentId: TARGET.deploymentId,
      sourceCommit: TARGET.sourceCommit,
      category: TARGET.eventCode,
    },
    environmentPresence: inspectEnvironment(env),
    networkRequests: 0,
    eventWrites: 0,
    dispatches: 0,
    journalWrites: 0,
  };
}

function printSafe(value) {
  stdout.write(`${JSON.stringify(value)}\n`);
}

async function cliMain(argv = process.argv.slice(2)) {
  const mode =
    argv.length === 0 || (argv.length === 1 && argv[0] === "--dry-run")
      ? "dry-run"
      : argv.length === 1 && argv[0] === "--preflight-only"
        ? "preflight"
        : argv.length === 1 && argv[0] === "--execute-once"
          ? "execute"
          : null;
  require(mode !== null, "unsupported_arguments");
  if (mode === "dry-run") {
    printSafe(dryRunReport());
    return;
  }
  if (mode === "preflight") {
    printSafe(await runReadOnlyPreflight({}));
    return;
  }
  require(stdin.isTTY && stdout.isTTY, "interactive_confirmation_required");
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    const result = await executeOneShot({
      confirm: (phrase) =>
        readline.question(`Review audience and type exactly: ${phrase}\n> `),
    });
    printSafe(result);
  } finally {
    readline.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  cliMain().catch((error) => {
    const code =
      error instanceof RunnerError ? error.code : "unexpected_failure";
    const safeEventId = error instanceof RunnerError ? error.safeEventId : null;
    process.stderr.write(
      `${JSON.stringify({ result: "STOP", code, safeEventId, retry: false })}\n`,
    );
    process.exitCode = 1;
  });
}
