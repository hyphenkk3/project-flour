import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  TARGET,
  RunnerError,
  createFilesystemJournal,
  dryRunReport,
  executeOneShot,
  inspectEnvironment,
  makeSyntheticEvent,
  runReadOnlyPreflight,
} from "./one-shot-dev-push-acceptance.mjs";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_ID = "00000000-0000-4000-8000-000000000099";
const NOW = Date.parse("2026-11-14T12:00:00.000Z");
const FAKE_SERVICE_KEY = "mock-service-role-not-a-real-credential";
const FAKE_DISPATCH_SECRET = "mock-dispatch-secret-not-a-real-credential";
const ENV = Object.freeze({
  NEXT_PUBLIC_SUPABASE_URL: TARGET.supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_KEY,
  STAFF_NOTIFICATION_DISPATCH_SECRET: FAKE_DISPATCH_SECRET,
  VERCEL_OIDC_TOKEN: "mock-vercel-oidc-not-a-real-credential",
  NEXT_PUBLIC_STAFF_NOTIFICATION_ANON_KEY: "mock-public-key",
  NEXT_PUBLIC_STAFF_PUSH_VAPID_PUBLIC_KEY: "A".repeat(87),
  STAFF_PUSH_VAPID_PRIVATE_KEY: "B".repeat(48),
  STAFF_PUSH_VAPID_SUBJECT: "mailto:test@example.invalid",
});

function fixtures() {
  const profiles = Array.from({ length: 7 }, (_, index) => ({
    id:
      index === 0
        ? OWNER_ID
        : `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    is_active: true,
    archived_at: null,
    is_master_owner: index === 0,
  }));
  const preferences = profiles.map((profile, index) => ({
    staff_id: profile.id,
    web_enabled: true,
    sound_enabled: index === 0,
    push_enabled: index === 0,
  }));
  const subscriptions = Array.from({ length: 3 }, () => ({
    staff_id: OWNER_ID,
    revoked_at: null,
    expiration_time: null,
  }));
  return { profiles, preferences, subscriptions };
}

function fakeFetch({
  eventReply = EVENT_ID,
  dispatchReply = "503",
  failEvent = false,
  failDispatch = false,
} = {}) {
  const calls = [];
  const fixture = fixtures();
  const impl = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({
      url: `${url.origin}${url.pathname}${url.search}`,
      method: init.method ?? "GET",
      headers: init.headers,
      body: init.body,
    });
    if (
      url.pathname === "/rest/v1/staff_notification_push_subscriptions" &&
      init.method === "HEAD"
    ) {
      return new Response(null, { status: 200 });
    }
    if (
      url.pathname === "/api/staff/notifications/dispatch" &&
      init.method === "GET"
    ) {
      return Response.json(
        { error: "Staff email dispatch is paused." },
        { status: 503 },
      );
    }
    if (url.pathname === "/rest/v1/staff_profiles")
      return Response.json(fixture.profiles);
    if (url.pathname === "/rest/v1/staff_notification_preferences")
      return Response.json(fixture.preferences);
    if (url.pathname === "/rest/v1/staff_notification_push_subscriptions")
      return Response.json(fixture.subscriptions);
    if (url.pathname === "/rest/v1/staff_notification_push_deliveries") {
      if (url.search.includes("event_id=eq.")) {
        return Response.json([
          { status: "sent" },
          { status: "sent" },
          { status: "sent" },
        ]);
      }
      return Response.json([]);
    }
    if (
      url.pathname === "/rest/v1/staff_notification_dispatch_config" &&
      url.search.includes("dispatch_url")
    )
      return Response.json([]);
    if (url.pathname === "/rest/v1/staff_notification_dispatch_config") {
      return Response.json([
        {
          email_dispatch_enabled: false,
          email_dispatch_test_mode: false,
          per_event_enabled: false,
        },
      ]);
    }
    if (
      url.pathname === "/rest/v1/rpc/emit_staff_notification_event" &&
      init.method === "POST"
    ) {
      if (failEvent) throw new Error("mock timeout");
      if (eventReply === "http-fail")
        return Response.json({ error: "mock" }, { status: 500 });
      return Response.json(eventReply);
    }
    if (
      url.pathname === "/api/staff/notifications/dispatch" &&
      init.method === "POST"
    ) {
      if (failDispatch) throw new Error("mock timeout");
      const body = JSON.parse(init.body);
      assert.equal(body.eventId, EVENT_ID);
      if (dispatchReply === "503") {
        return Response.json(
          {
            error: "Staff email dispatch is paused.",
            push: {
              queued: 3,
              attempted: 3,
              sent: 3,
              failed: 0,
              revoked: 0,
              suppressed: 0,
              completionUnrecorded: 0,
            },
            ignoredPrivateValue: FAKE_SERVICE_KEY,
          },
          { status: 503 },
        );
      }
      return Response.json(dispatchReply, { status: Number(dispatchReply) });
    }
    throw new Error(`unexpected mock request ${init.method} ${url.pathname}`);
  };
  return { fetchImpl: impl, calls };
}

function memoryJournal() {
  let value = null;
  return {
    async exists() {
      return value !== null;
    },
    async create(next) {
      assert.equal(value, null);
      value = structuredClone(next);
    },
    async update(next) {
      assert.notEqual(value, null);
      value = structuredClone(next);
    },
    get value() {
      return value;
    },
  };
}

test("default dry-run has no network, event, dispatch, or journal effects", () => {
  assert.deepEqual(dryRunReport(ENV), {
    mode: "dry-run",
    target: {
      projectRef: TARGET.projectRef,
      previewOrigin: TARGET.previewOrigin,
      deploymentId: TARGET.deploymentId,
      sourceCommit: TARGET.sourceCommit,
      category: "new_order",
    },
    environmentPresence: inspectEnvironment(ENV),
    networkRequests: 0,
    eventWrites: 0,
    dispatches: 0,
    journalWrites: 0,
  });
});

test("rejects a Production Supabase URL before any request", async () => {
  const mock = fakeFetch();
  await assert.rejects(
    runReadOnlyPreflight({
      env: {
        ...ENV,
        NEXT_PUBLIC_SUPABASE_URL: "https://cuowwlduhxxifmpvpltt.supabase.co",
      },
      fetchImpl: mock.fetchImpl,
    }),
    (error) =>
      error instanceof RunnerError &&
      error.code === "wrong_or_missing_dev_supabase_url",
  );
  assert.equal(mock.calls.length, 0);
});

test("missing credentials are rejected without echoing credential contents", async () => {
  const mock = fakeFetch();
  await assert.rejects(
    runReadOnlyPreflight({
      env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: "" },
      fetchImpl: mock.fetchImpl,
    }),
    (error) =>
      error instanceof RunnerError &&
      error.code === "missing_service_role_credential" &&
      !error.message.includes(FAKE_SERVICE_KEY),
  );
  assert.equal(mock.calls.length, 0);
});

test("missing dedicated dispatch secret is rejected without using a generic cron secret", async () => {
  const mock = fakeFetch();
  const env = {
    ...ENV,
    STAFF_NOTIFICATION_DISPATCH_SECRET: "",
    CRON_SECRET: "must-not-be-used",
  };
  await assert.rejects(
    runReadOnlyPreflight({ env, fetchImpl: mock.fetchImpl }),
    (error) =>
      error instanceof RunnerError &&
      error.code === "missing_dispatch_credential" &&
      !error.message.includes("must-not-be-used"),
  );
  assert.equal(mock.calls.length, 0);
});

test("missing Vercel SSO token fails before contacting the Preview", async () => {
  const mock = fakeFetch();
  await assert.rejects(
    runReadOnlyPreflight({
      env: { ...ENV, VERCEL_OIDC_TOKEN: "" },
      fetchImpl: mock.fetchImpl,
    }),
    (error) =>
      error instanceof RunnerError &&
      error.code === "missing_vercel_preview_access_token",
  );
  assert.equal(mock.calls.length, 0);
});

test("Production service-role key fails the fixed DEV authorization probe", async () => {
  const mock = fakeFetch();
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    if (
      url.pathname === "/rest/v1/staff_notification_push_subscriptions" &&
      init.method === "HEAD"
    ) {
      return new Response(null, { status: 401 });
    }
    return mock.fetchImpl(input, init);
  };
  await assert.rejects(
    runReadOnlyPreflight({ env: ENV, fetchImpl }),
    (error) =>
      error instanceof RunnerError &&
      error.code === "dev_service_role_probe_rejected",
  );
  assert.equal(
    mock.calls.some((call) =>
      call.url.endsWith("/api/staff/notifications/dispatch"),
    ),
    false,
  );
});

test("read-only preflight verifies DEV credentials and exact expected audience", async () => {
  const mock = fakeFetch();
  const result = await runReadOnlyPreflight({
    env: ENV,
    fetchImpl: mock.fetchImpl,
    now: NOW,
  });
  assert.deepEqual(result.audience, {
    webEligible: 7,
    soundEligible: 1,
    pushEligibleStaff: 1,
    activeOwnerSubscriptions: 3,
  });
  assert.equal(result.checks.serviceRoleAcceptedByDev, true);
  assert.equal(result.checks.dispatchSecretAcceptedByPausedPreview, true);
  assert.equal(result.checks.outstandingDeliveries, 0);
  assert.ok(
    mock.calls.every((call) => call.method === "GET" || call.method === "HEAD"),
  );
});

test("rejects audience changes and unexpected queue backlog", async () => {
  const mock = fakeFetch();
  mock.fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/rest/v1/staff_notification_push_deliveries")
      return Response.json([{ status: "pending" }]);
    return fakeFetch().fetchImpl(input, init);
  };
  await assert.rejects(
    runReadOnlyPreflight({ env: ENV, fetchImpl: mock.fetchImpl, now: NOW }),
    (error) =>
      error instanceof RunnerError &&
      error.code === "push_delivery_backlog_not_empty",
  );
});

test("rejects a newly eligible non-Owner Push recipient before writing", async () => {
  const base = fakeFetch();
  const mockFetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/rest/v1/staff_notification_preferences") {
      const preferences = fixtures().preferences;
      preferences[1].push_enabled = true;
      return Response.json(preferences);
    }
    return base.fetchImpl(input, init);
  };
  await assert.rejects(
    runReadOnlyPreflight({ env: ENV, fetchImpl: mockFetch, now: NOW }),
    (error) =>
      error instanceof RunnerError &&
      error.code === "push_audience_not_owner_only",
  );
  assert.equal(
    base.calls.some((call) =>
      call.url.includes("emit_staff_notification_event"),
    ),
    false,
  );
});

test("synthetic event parameters are fixed, New Order, and business references are null", () => {
  const event = makeSyntheticEvent({
    eventKey:
      "push-device-acceptance:20261114T120000Z:00000000-0000-4000-8000-000000000099",
    title: "[DEV SYNTHETIC PUSH ACCEPTANCE]",
    description: "Synthetic staff notification test; no customer order.",
    payload: {
      synthetic: true,
      purpose: "push-device-acceptance",
      correlation: "test",
    },
  });
  assert.equal(event.p_code, "new_order");
  assert.equal(event.p_order_id, null);
  assert.equal(event.p_approval_id, null);
  assert.equal(event.p_href, "/owner/orders");
  assert.throws(
    () =>
      makeSyntheticEvent({
        eventKey: "customer-order:1",
        title: "x",
        description: "y",
        payload: {},
      }),
    RunnerError,
  );
});

test("successful run creates once and dispatches only the returned event UUID", async () => {
  const mock = fakeFetch();
  const journal = memoryJournal();
  const result = await executeOneShot({
    env: ENV,
    fetchImpl: mock.fetchImpl,
    journal,
    confirm: async (phrase) => phrase,
    now: NOW,
    uuid: () => EVENT_ID,
  });
  const eventCalls = mock.calls.filter((call) =>
    call.url.includes("emit_staff_notification_event"),
  );
  const dispatchCalls = mock.calls.filter(
    (call) =>
      call.url.endsWith("/api/staff/notifications/dispatch") &&
      call.method === "POST",
  );
  assert.equal(eventCalls.length, 1);
  assert.equal(dispatchCalls.length, 1);
  assert.equal(
    dispatchCalls[0].headers["x-vercel-trusted-oidc-idp-token"],
    ENV.VERCEL_OIDC_TOKEN,
  );
  assert.equal(JSON.parse(eventCalls[0].body).p_code, "new_order");
  assert.equal(JSON.parse(eventCalls[0].body).p_order_id, null);
  assert.deepEqual(JSON.parse(dispatchCalls[0].body), { eventId: EVENT_ID });
  assert.equal(dispatchCalls[0].url.includes("push-retry"), false);
  assert.equal(result.phase, "dispatch_processed_email_paused_503");
  assert.equal(result.push.sent, 3);
  assert.deepEqual(result.deliveryStatuses, {
    pending: 0,
    claimed: 0,
    sent: 3,
    failed: 0,
    suppressed: 0,
    unknown: 0,
  });
  assert.equal(JSON.stringify(result).includes(FAKE_SERVICE_KEY), false);
  assert.equal(JSON.stringify(result).includes(FAKE_DISPATCH_SECRET), false);
  assert.equal(JSON.stringify(result).includes(ENV.VERCEL_OIDC_TOKEN), false);
  assert.equal(
    JSON.stringify(journal.value).includes(FAKE_DISPATCH_SECRET),
    false,
  );
  assert.equal(
    JSON.stringify(journal.value).includes(ENV.VERCEL_OIDC_TOKEN),
    false,
  );
  assert.equal(journal.value.eventId, EVENT_ID);
});

test("uncertain event creation consumes one-shot state and never dispatches or retries", async () => {
  const mock = fakeFetch({ failEvent: true });
  const journal = memoryJournal();
  const run = () =>
    executeOneShot({
      env: ENV,
      fetchImpl: mock.fetchImpl,
      journal,
      confirm: async (phrase) => phrase,
      now: NOW,
      uuid: () => EVENT_ID,
    });
  await assert.rejects(
    run(),
    (error) => error.code === "event_creation_ambiguous_do_not_retry",
  );
  await assert.rejects(
    run(),
    (error) => error.code === "one_shot_already_consumed",
  );
  assert.equal(
    mock.calls.filter((call) =>
      call.url.includes("emit_staff_notification_event"),
    ).length,
    1,
  );
  assert.equal(
    mock.calls.filter(
      (call) => call.method === "POST" && call.url.endsWith("/dispatch"),
    ).length,
    0,
  );
  assert.equal(journal.value.phase, "event_creation_ambiguous");
});

test("null or failed event response is never replaced with another event", async () => {
  for (const eventReply of [null, "http-fail"]) {
    const mock = fakeFetch({ eventReply });
    const journal = memoryJournal();
    await assert.rejects(
      executeOneShot({
        env: ENV,
        fetchImpl: mock.fetchImpl,
        journal,
        confirm: async (phrase) => phrase,
        now: NOW,
        uuid: () => EVENT_ID,
      }),
    );
    assert.equal(
      mock.calls.filter((call) =>
        call.url.includes("emit_staff_notification_event"),
      ).length,
      1,
    );
    assert.equal(
      mock.calls.filter(
        (call) => call.method === "POST" && call.url.endsWith("/dispatch"),
      ).length,
      0,
    );
  }
});

test("dispatch network ambiguity preserves event ID and never retries", async () => {
  const mock = fakeFetch({ failDispatch: true });
  const journal = memoryJournal();
  const run = () =>
    executeOneShot({
      env: ENV,
      fetchImpl: mock.fetchImpl,
      journal,
      confirm: async (phrase) => phrase,
      now: NOW,
      uuid: () => EVENT_ID,
    });
  await assert.rejects(
    run(),
    (error) => error.code === "dispatch_ambiguous_do_not_retry",
  );
  await assert.rejects(
    run(),
    (error) => error.code === "one_shot_already_consumed",
  );
  assert.equal(journal.value.eventId, EVENT_ID);
  assert.equal(journal.value.phase, "dispatch_ambiguous");
  assert.equal(
    mock.calls.filter(
      (call) =>
        call.url.endsWith("/api/staff/notifications/dispatch") &&
        call.method === "POST",
    ).length,
    1,
  );
});

test("event ID is returned safely if journal persistence fails before dispatch", async () => {
  const mock = fakeFetch();
  const journal = {
    async exists() {
      return false;
    },
    async create() {},
    async update(value) {
      if (value.phase === "event_created") throw new Error("disk failure");
    },
  };
  await assert.rejects(
    executeOneShot({
      env: ENV,
      fetchImpl: mock.fetchImpl,
      journal,
      confirm: async (phrase) => phrase,
      now: NOW,
      uuid: () => EVENT_ID,
    }),
    (error) =>
      error.code === "event_created_journal_persist_failed_do_not_dispatch" &&
      error.safeEventId === EVENT_ID,
  );
  assert.equal(
    mock.calls.filter(
      (call) =>
        call.url.endsWith("/api/staff/notifications/dispatch") &&
        call.method === "POST",
    ).length,
    0,
  );
});

test("HTTP 503 after Push results is recorded without any retry", async () => {
  const mock = fakeFetch({ dispatchReply: "503" });
  const journal = memoryJournal();
  const result = await executeOneShot({
    env: ENV,
    fetchImpl: mock.fetchImpl,
    journal,
    confirm: async (phrase) => phrase,
    now: NOW,
    uuid: () => EVENT_ID,
  });
  assert.equal(result.dispatchStatus, 503);
  assert.equal(result.phase, "dispatch_processed_email_paused_503");
  assert.equal(
    mock.calls.filter(
      (call) =>
        call.url.endsWith("/api/staff/notifications/dispatch") &&
        call.method === "POST",
    ).length,
    1,
  );
  assert.equal(journal.value.eventId, EVENT_ID);
});

test("non-503 or unreadable dispatch result is ambiguous and is not retried", async () => {
  const mock = fakeFetch({ dispatchReply: "500" });
  const journal = memoryJournal();
  const result = await executeOneShot({
    env: ENV,
    fetchImpl: mock.fetchImpl,
    journal,
    confirm: async (phrase) => phrase,
    now: NOW,
    uuid: () => EVENT_ID,
  });
  assert.equal(result.phase, "dispatch_ambiguous");
  assert.equal(journal.value.eventId, EVENT_ID);
  assert.equal(
    mock.calls.filter(
      (call) =>
        call.url.endsWith("/api/staff/notifications/dispatch") &&
        call.method === "POST",
    ).length,
    1,
  );
});

test("confirmation mismatch and existing journal both stop before event creation", async () => {
  const mock = fakeFetch();
  const journal = memoryJournal();
  await assert.rejects(
    executeOneShot({
      env: ENV,
      fetchImpl: mock.fetchImpl,
      journal,
      confirm: async () => "no",
      now: NOW,
      uuid: () => EVENT_ID,
    }),
    (error) => error.code === "operator_confirmation_not_matched",
  );
  assert.equal(
    mock.calls.filter((call) =>
      call.url.includes("emit_staff_notification_event"),
    ).length,
    0,
  );
  await journal.create({ phase: "event_created" });
  await assert.rejects(
    executeOneShot({
      env: ENV,
      fetchImpl: mock.fetchImpl,
      journal,
      confirm: async (phrase) => phrase,
      now: NOW,
      uuid: () => EVENT_ID,
    }),
    (error) => error.code === "one_shot_already_consumed",
  );
  assert.equal(
    mock.calls.filter((call) =>
      call.url.includes("emit_staff_notification_event"),
    ).length,
    0,
  );
});

test("filesystem journal is private and contains no credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "project-flour-push-test-"));
  const path = join(directory, "journal.json");
  try {
    const journal = createFilesystemJournal(path);
    await journal.create({
      phase: "event_created",
      eventId: EVENT_ID,
      eventKey: "synthetic-key",
    });
    const fileStat = await stat(path);
    const fileBody = await readFile(path, "utf8");
    assert.equal(fileStat.mode & 0o777, 0o600);
    assert.equal(fileBody.includes(FAKE_SERVICE_KEY), false);
    assert.equal(fileBody.includes(FAKE_DISPATCH_SECRET), false);
    assert.equal(await journal.exists(), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
