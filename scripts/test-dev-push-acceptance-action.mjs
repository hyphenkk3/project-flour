import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  DEV_PUSH_ACCEPTANCE_COOKIE,
  DEV_PUSH_ACCEPTANCE_EVENT_KEY,
  DEV_PUSH_ACCEPTANCE_TARGET,
  authorizeMasterOwner,
  deploymentArmValue,
  inspectDeploymentIdentity,
  isDeploymentArmed,
  makeFixedSyntheticEvent,
  runOneShotAcceptance,
  validateActionBody,
  validateDeploymentConfirmation,
  validatePreflightSnapshot,
  validateRequestOrigin,
} from "../src/foundation/staff/dev-push-acceptance-core.mjs";

const environment = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_PROJECT_ID: DEV_PUSH_ACCEPTANCE_TARGET.projectId,
  VERCEL_GIT_COMMIT_REF: DEV_PUSH_ACCEPTANCE_TARGET.gitBranch,
  VERCEL_DEPLOYMENT_ID: "dpl_TestDeployment123",
  VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
  VERCEL_BRANCH_URL: DEV_PUSH_ACCEPTANCE_TARGET.branchHost,
  NEXT_PUBLIC_SUPABASE_URL: DEV_PUSH_ACCEPTANCE_TARGET.supabaseUrl,
};
const goodActor = {
  isActive: true,
  archivedAt: null,
  isMasterOwner: true,
  mustChangePassword: false,
  role: { code: "owner" },
};
const goodConfirmations = {
  sevenWebEligibleStaffAcknowledged: true,
  sixOtherListenersCoordinated: true,
  threeOwnerSubscriptionsAccountedFor: true,
  iphonePermissionAndForceCloseReady: true,
  freshPickScheduleVerifiedDisabled: true,
  freshPickPushVerifiedOff: true,
  pushBatchRetryScheduleDisabled: true,
  emailVerifiedFrozen: true,
};
const eventId = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const safeSnapshot = {
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
};

function validBody(action = "arm") {
  return {
    action,
    deploymentId: environment.VERCEL_DEPLOYMENT_ID,
    commitSha: environment.VERCEL_GIT_COMMIT_SHA,
    confirmations: { ...goodConfirmations },
  };
}

async function successDependencies(overrides = {}) {
  return {
    preflight: async () => ({ ok: true }),
    createEvent: async (payload) => {
      assert.deepEqual(payload, makeFixedSyntheticEvent());
      return eventId;
    },
    dispatch: async (id) => {
      assert.equal(id, eventId);
      return {
        queued: 3,
        attempted: 3,
        sent: 3,
        failed: 0,
        revoked: 0,
        suppressed: 0,
        completionUnrecorded: 0,
        skipped: null,
      };
    },
    ...overrides,
  };
}

test("accepts only the exact approved DEV Preview deployment identity", () => {
  const identity = inspectDeploymentIdentity(environment);
  assert.equal(identity.ok, true);
  assert.equal(identity.deploymentId, environment.VERCEL_DEPLOYMENT_ID);
  assert.equal(identity.commitSha, environment.VERCEL_GIT_COMMIT_SHA);
});

test("rejects Production, wrong project, wrong branch, wrong host and wrong Supabase", () => {
  for (const override of [
    { VERCEL_ENV: "production" },
    { VERCEL: undefined },
    { VERCEL_PROJECT_ID: "another-project" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_BRANCH_URL: "project-flour-other-preview-hyphen-org.vercel.app" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://cuowwlduhxxifmpvpltt.supabase.co" },
  ]) {
    assert.equal(
      inspectDeploymentIdentity({ ...environment, ...override }).ok,
      false,
    );
  }
});

test("rejects missing deployment ID or malformed source commit", () => {
  assert.equal(
    inspectDeploymentIdentity({ ...environment, VERCEL_DEPLOYMENT_ID: "" }).ok,
    false,
  );
  assert.equal(
    inspectDeploymentIdentity({
      ...environment,
      VERCEL_GIT_COMMIT_SHA: "not-a-sha",
    }).ok,
    false,
  );
});

test("rejects mismatched host, cross-origin, and malformed request URL", () => {
  const identity = inspectDeploymentIdentity(environment);
  assert.equal(
    validateRequestOrigin({
      host: identity.host,
      origin: `https://${identity.host}`,
      requestUrl: `https://${identity.host}/api/action`,
      identity,
    }).ok,
    true,
  );
  assert.equal(
    validateRequestOrigin({
      host: identity.host,
      origin: "https://whitebird.asia",
      requestUrl: `https://${identity.host}/api/action`,
      identity,
    }).ok,
    false,
  );
  assert.equal(
    validateRequestOrigin({
      host: "whitebird.asia",
      origin: `https://${identity.host}`,
      requestUrl: `https://${identity.host}/api/action`,
      identity,
    }).ok,
    false,
  );
  assert.equal(
    validateRequestOrigin({
      host: identity.host,
      origin: `https://${identity.host}`,
      requestUrl: "not a URL",
      identity,
    }).ok,
    false,
  );
});

test("rejects an invalid deployment identity before action", () => {
  assert.equal(
    validateRequestOrigin({
      host: "x",
      origin: "x",
      requestUrl: "x",
      identity: { ok: false },
    }).ok,
    false,
  );
});

test("rejects anonymous, inactive, archived, non-owner, and forced-password-change actors", () => {
  assert.equal(authorizeMasterOwner(null).ok, false);
  assert.equal(
    authorizeMasterOwner({ ...goodActor, isActive: false }).ok,
    false,
  );
  assert.equal(
    authorizeMasterOwner({ ...goodActor, archivedAt: "2026-01-01" }).ok,
    false,
  );
  assert.equal(
    authorizeMasterOwner({ ...goodActor, isMasterOwner: false }).ok,
    false,
  );
  assert.equal(
    authorizeMasterOwner({ ...goodActor, role: { code: "manager" } }).ok,
    false,
  );
  assert.equal(
    authorizeMasterOwner({ ...goodActor, mustChangePassword: true }).ok,
    false,
  );
  assert.equal(authorizeMasterOwner(goodActor).ok, true);
});

test("accepts only the fixed arm/execute request and exact safety confirmations", () => {
  assert.equal(validateActionBody(validBody("arm")).ok, true);
  assert.equal(validateActionBody(validBody("execute")).ok, true);
  const withEvent = { ...validBody(), eventId };
  assert.equal(validateActionBody(withEvent).ok, false);
  const withContent = { ...validBody(), title: "caller content" };
  assert.equal(validateActionBody(withContent).ok, false);
  assert.equal(
    validateActionBody({
      ...validBody(),
      confirmations: { ...goodConfirmations, emailVerifiedFrozen: false },
    }).ok,
    false,
  );
  assert.equal(
    validateActionBody({
      ...validBody(),
      confirmations: { ...goodConfirmations, extra: true },
    }).ok,
    false,
  );
  assert.equal(
    validateActionBody({ ...validBody(), action: "batch" }).ok,
    false,
  );
});

test("arms only the exact deployment ID and source SHA", () => {
  const identity = inspectDeploymentIdentity(environment);
  const arm = deploymentArmValue(identity);
  assert.equal(isDeploymentArmed(arm, identity), true);
  assert.equal(
    isDeploymentArmed(
      `${identity.deploymentId}.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`,
      identity,
    ),
    false,
  );
  assert.equal(DEV_PUSH_ACCEPTANCE_COOKIE.startsWith("__Host-"), true);
});

test("requires confirmation of the exact deployed ID and source commit", () => {
  const identity = inspectDeploymentIdentity(environment);
  assert.equal(
    validateDeploymentConfirmation(
      {
        deploymentId: identity.deploymentId,
        commitSha: identity.commitSha.toUpperCase(),
      },
      identity,
    ).ok,
    true,
  );
  assert.equal(
    validateDeploymentConfirmation(
      { deploymentId: "dpl_OtherPreview", commitSha: identity.commitSha },
      identity,
    ).ok,
    false,
  );
  assert.equal(
    validateDeploymentConfirmation(
      {
        deploymentId: identity.deploymentId,
        commitSha: "b".repeat(40),
      },
      identity,
    ).ok,
    false,
  );
});

test("fails closed on each preflight invariant", () => {
  assert.equal(validatePreflightSnapshot(safeSnapshot).ok, true);
  for (const key of Object.keys(safeSnapshot)) {
    assert.equal(
      validatePreflightSnapshot({ ...safeSnapshot, [key]: false }).ok,
      false,
      key,
    );
  }
  assert.equal(validatePreflightSnapshot(null).ok, false);
});

test("fixed synthetic event has no business references or caller-controlled fields", () => {
  const payload = makeFixedSyntheticEvent();
  assert.equal(payload.p_event_key, DEV_PUSH_ACCEPTANCE_EVENT_KEY);
  assert.equal(payload.p_code, "new_order");
  assert.equal(payload.p_order_id, null);
  assert.equal(payload.p_approval_id, null);
  assert.match(payload.p_title, /SYNTHETIC/);
  assert.equal(payload.p_payload.synthetic, true);
  assert.equal(Object.keys(payload).includes("eventId"), false);
});

test("dispatches exactly the UUID returned by one creation call", async () => {
  let createCalls = 0;
  let dispatchCalls = 0;
  let dispatchedId = null;
  const result = await runOneShotAcceptance(
    await successDependencies({
      createEvent: async () => {
        createCalls += 1;
        return eventId;
      },
      dispatch: async (id) => {
        dispatchCalls += 1;
        dispatchedId = id;
        return {
          queued: 3,
          attempted: 3,
          sent: 3,
          failed: 0,
          revoked: 0,
          suppressed: 0,
          completionUnrecorded: 0,
          skipped: null,
        };
      },
    }),
  );
  assert.equal(result.result, "dispatch_returned");
  assert.equal(createCalls, 1);
  assert.equal(dispatchCalls, 1);
  assert.equal(dispatchedId, eventId);
});

test("does not create or dispatch when read-only preflight is blocked", async () => {
  let writes = 0;
  const result = await runOneShotAcceptance(
    await successDependencies({
      preflight: async () => ({ ok: false, code: "audience_changed" }),
      createEvent: async () => {
        writes += 1;
        return eventId;
      },
      dispatch: async () => {
        writes += 1;
        return {};
      },
    }),
  );
  assert.equal(result.code, "audience_changed");
  assert.equal(writes, 0);
});

test("duplicate RPC result cannot dispatch", async () => {
  let dispatchCalls = 0;
  const result = await runOneShotAcceptance(
    await successDependencies({
      createEvent: async () => null,
      dispatch: async () => {
        dispatchCalls += 1;
        return {};
      },
    }),
  );
  assert.equal(result.code, "event_not_created_or_duplicate");
  assert.equal(dispatchCalls, 0);
});

test("invalid or ambiguous event creation cannot dispatch or create a replacement", async () => {
  for (const createEvent of [
    async () => "not-an-id",
    async () => {
      throw new Error("private response");
    },
  ]) {
    let createCalls = 0;
    let dispatchCalls = 0;
    const result = await runOneShotAcceptance(
      await successDependencies({
        createEvent: async (payload) => {
          createCalls += 1;
          return createEvent(payload);
        },
        dispatch: async () => {
          dispatchCalls += 1;
          return {};
        },
      }),
    );
    assert.equal(createCalls, 1);
    assert.equal(dispatchCalls, 0);
    assert.equal(result.eventId, null);
  }
});

test("concurrent requests rely on one atomic fixed-key insertion and only winner dispatches", async () => {
  let committed = false;
  let dispatchCalls = 0;
  const rpc = async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (committed) return null;
    committed = true;
    return eventId;
  };
  const makeRequest = () =>
    runOneShotAcceptance({
      preflight: async () => ({ ok: true }),
      createEvent: rpc,
      dispatch: async (id) => {
        assert.equal(id, eventId);
        dispatchCalls += 1;
        return {
          queued: 3,
          attempted: 3,
          sent: 3,
          failed: 0,
          revoked: 0,
          suppressed: 0,
          completionUnrecorded: 0,
          skipped: null,
        };
      },
    });
  const results = await Promise.all([
    makeRequest(),
    makeRequest(),
    makeRequest(),
  ]);
  assert.equal(
    results.filter((result) => result.result === "dispatch_returned").length,
    1,
  );
  assert.equal(dispatchCalls, 1);
});

test("dispatch rejection is ambiguous and never retried", async () => {
  let dispatchCalls = 0;
  const result = await runOneShotAcceptance(
    await successDependencies({
      dispatch: async () => {
        dispatchCalls += 1;
        throw new Error("provider/private");
      },
    }),
  );
  assert.equal(result.code, "dispatch_ambiguous");
  assert.equal(result.eventId, eventId);
  assert.equal(dispatchCalls, 1);
});

test("HTTP 503 after possible dispatch is treated as terminal with no retry", async () => {
  let dispatchCalls = 0;
  const result = await runOneShotAcceptance(
    await successDependencies({
      dispatch: async () => {
        dispatchCalls += 1;
        return { httpStatus: 503, secret: "do-not-log" };
      },
    }),
  );
  assert.equal(result.code, "dispatch_ambiguous_503");
  assert.equal(dispatchCalls, 1);
});

test("unknown or incomplete dispatch response is ambiguous and never retried", async () => {
  let dispatchCalls = 0;
  const result = await runOneShotAcceptance(
    await successDependencies({
      dispatch: async (id) => {
        assert.equal(id, eventId);
        dispatchCalls += 1;
        return {};
      },
    }),
  );
  assert.equal(result.code, "dispatch_response_ambiguous");
  assert.equal(result.eventId, eventId);
  assert.equal(dispatchCalls, 1);
});

test("dispatch cannot use a batch API and passes only one event ID", async () => {
  const calls = [];
  const result = await runOneShotAcceptance(
    await successDependencies({
      dispatch: async (...args) => {
        calls.push(args);
        return {
          queued: 3,
          attempted: 3,
          sent: 3,
          failed: 0,
          revoked: 0,
          suppressed: 0,
          completionUnrecorded: 0,
          skipped: null,
          endpoint: "private",
        };
      },
    }),
  );
  assert.equal(result.result, "dispatch_returned");
  assert.deepEqual(calls, [[eventId]]);
  assert.deepEqual(result.dispatch, {
    queued: 3,
    attempted: 3,
    sent: 3,
    failed: 0,
    revoked: 0,
    suppressed: 0,
    completionUnrecorded: 0,
  });
});

test("sanitized logs omit payloads, credentials, endpoints, and arbitrary provider fields", async () => {
  const logs = [];
  await runOneShotAcceptance(
    await successDependencies({
      dispatch: async () => ({
        sent: 2,
        endpoint: "https://secret.invalid/token",
        credential: "secret",
        payload: "customer",
      }),
      log: (entry) => logs.push(entry),
    }),
  );
  const output = JSON.stringify(logs);
  assert.equal(output.includes("secret.invalid"), false);
  assert.equal(output.includes("customer"), false);
  assert.equal(output.includes("credential"), false);
});

test("server route is Owner-only, deployment-bound, event-scoped, and has no batch/email path", () => {
  const route = readFileSync(
    resolve("src/app/api/staff/notifications/dev-push-acceptance/route.ts"),
    "utf8",
  );
  assert.match(route, /getSessionStaff\(\)/);
  assert.match(route, /authorizeMasterOwner\(session\)/);
  assert.match(route, /validateRequestOrigin/);
  assert.match(route, /validateDeploymentConfirmation/);
  assert.match(route, /isDeploymentArmed\(cookieValue, identity\)/);
  assert.match(route, /emit_staff_notification_event/);
  assert.match(route, /runOneShotAcceptance/);
  assert.match(
    route,
    /deliverPendingStaffPushNotifications\(\{[\s\S]*?eventId,[\s\S]*?failClosed: true,[\s\S]*?preserveSubscriptions: true/,
  );
  assert.doesNotMatch(
    route,
    /retryPendingStaffPushNotifications|push-retry|deliverPendingStaffNotificationEmails/,
  );
  assert.doesNotMatch(
    route,
    /insert\(.*orders|from\(.*orders|from\(.*stock|from\(.*holds|from\(.*payments/i,
  );
  const core = readFileSync(
    resolve("src/foundation/staff/dev-push-acceptance-core.mjs"),
    "utf8",
  );
  assert.match(core, /makeFixedSyntheticEvent/);
  const guarded = route.indexOf("isDeploymentArmed(cookieValue, identity)");
  const eventCall = route.indexOf(
    'admin.rpc(\n        "emit_staff_notification_event"',
  );
  assert.ok(guarded >= 0 && eventCall > guarded);

  const eventMigration = readFileSync(
    resolve(
      "supabase/migrations/20260903160000_staff_notification_reliability.sql",
    ),
    "utf8",
  );
  assert.match(
    eventMigration,
    /constraint staff_notification_events_event_key_unique unique \(event_key\)/i,
  );
  assert.match(
    eventMigration,
    /on conflict \(event_key\) do nothing[\s\S]*?returning id into inserted_id/i,
  );
});
