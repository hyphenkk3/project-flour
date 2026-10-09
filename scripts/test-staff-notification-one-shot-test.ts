import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createOneShotTestResendMailer,
  createResendStaffNotificationMailer,
  deliverPendingStaffNotificationEmails,
} from "../src/foundation/staff/staff-notification-dispatch";
import { isDevOneShotEmailTestEnvironment } from "../src/foundation/staff/staff-notification-one-shot-test";

const read = (path: string) => readFileSync(resolve(path), "utf8");

const attempt = {
  scopeId: "10000000-0000-4000-8000-000000000001",
  eventId: "20000000-0000-4000-8000-000000000001",
  staffId: "30000000-0000-4000-8000-000000000001",
  deliveryId: "40000000-0000-4000-8000-000000000001",
};

async function main() {
  const devPreview = {
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "debug/mobile-add-to-order-safari",
    NEXT_PUBLIC_SUPABASE_URL: "https://tzwtpxdcggesgjaqxkqr.supabase.co",
  } as NodeJS.ProcessEnv;
  assert.equal(isDevOneShotEmailTestEnvironment(devPreview), true);
  assert.equal(
    isDevOneShotEmailTestEnvironment({
      ...devPreview,
      VERCEL_ENV: "production",
    }),
    false,
  );
  const route = read("src/app/api/staff/notifications/one-shot-test/route.ts");
  assert.match(route, /staff\.isMasterOwner/);
  assert.match(route, /staff\.role\.code !== "owner"/);
  assert.match(route, /Only scopeId, eventId, and staffId are accepted/);
  assert.match(route, /reason: result\.reason/);
  assert.match(route, /status: 409/);
  assert.doesNotMatch(route, /arm_staff_notification_email_test_scope/);
  const oneShot = read(
    "src/foundation/staff/staff-notification-one-shot-test.ts",
  );
  assert.match(oneShot, /claim_staff_notification_email_test_delivery/);
  assert.match(oneShot, /staff_notification_email_test_scope_is_armed/);
  assert.match(oneShot, /staff_notification_email_test_scope_is_current/);
  assert.match(
    oneShot,
    /authorize_staff_notification_email_test_provider_attempt/,
  );
  assert.doesNotMatch(
    oneShot,
    /claim_staff_notification_email_deliveries_for_staff"/,
  );
  assert.equal(
    (
      read("src/foundation/staff/staff-notification-dispatch.ts").match(
        /resend\.emails\.send\(/g,
      ) ?? []
    ).length,
    1,
    "the normal and test senders must share one provider boundary",
  );
  assert.equal(
    isDevOneShotEmailTestEnvironment({
      ...devPreview,
      VERCEL_GIT_COMMIT_REF: "main",
    }),
    false,
  );
  assert.equal(
    isDevOneShotEmailTestEnvironment({
      ...devPreview,
      NEXT_PUBLIC_SUPABASE_URL:
        "https://tzwtpxdcggesgjaqxkqr.supabase.co.attacker.invalid",
    }),
    false,
  );

  let claimCalls = 0;
  let normalProviderCalls = 0;
  const normal = await deliverPendingStaffNotificationEmails({
    dispatchEnabled: async () => false,
    claimer: async () => {
      claimCalls += 1;
      return [];
    },
    mailer: {
      async send() {
        normalProviderCalls += 1;
        return { id: "mock" };
      },
    },
  });
  assert.deepEqual(normal, []);
  assert.equal(claimCalls, 0, "normal dispatch must not claim in test mode");
  assert.equal(
    normalProviderCalls,
    0,
    "normal dispatch must not send in test mode",
  );

  const normalMailer = createResendStaffNotificationMailer(async () => false);
  assert.equal(
    (
      await normalMailer.send({
        to: "recipient@example.invalid",
        subject: "synthetic",
        html: "synthetic",
        idempotencyKey: "synthetic",
      })
    ).skipped,
    true,
  );

  let providerCalls = 0;
  const denied = createOneShotTestResendMailer({
    environmentIsDev: () => true,
    authorize: async () => false,
    record: async () => undefined,
    sendProvider: async () => {
      providerCalls += 1;
      return { id: "must-not-be-called" };
    },
  });
  assert.equal(
    (
      await denied.send({
        to: "recipient@example.invalid",
        subject: "synthetic",
        html: "synthetic",
        idempotencyKey: "synthetic",
        oneShot: attempt,
      })
    ).skipped,
    true,
  );
  assert.equal(
    providerCalls,
    0,
    "denied durable authorization means no provider call",
  );

  const wrongEnvironment = createOneShotTestResendMailer({
    environmentIsDev: () => false,
    authorize: async () => {
      throw new Error("must not authorize outside DEV Preview");
    },
    record: async () => undefined,
    sendProvider: async () => {
      providerCalls += 1;
      return { id: "must-not-be-called" };
    },
  });
  assert.equal(
    (
      await wrongEnvironment.send({
        to: "recipient@example.invalid",
        subject: "synthetic",
        html: "synthetic",
        idempotencyKey: "synthetic",
        oneShot: attempt,
      })
    ).skipped,
    true,
  );
  assert.equal(
    providerCalls,
    0,
    "wrong deployment environment fails before DB/provider",
  );

  const shutDownBeforeAuthorization = createOneShotTestResendMailer({
    environmentIsDev: () => true,
    authorize: async () => false,
    record: async () => undefined,
    sendProvider: async () => {
      providerCalls += 1;
      return { id: "must-not-be-called" };
    },
  });
  assert.equal(
    (
      await shutDownBeforeAuthorization.send({
        to: "recipient@example.invalid",
        subject: "synthetic",
        html: "synthetic",
        idempotencyKey: "synthetic",
        oneShot: attempt,
      })
    ).skipped,
    true,
  );
  assert.equal(
    providerCalls,
    0,
    "shutdown before provider authorization blocks the send",
  );

  let attemptState: "not_started" | "authorized" | "accepted" | "unknown" =
    "not_started";
  let oneProviderAttemptCount = 0;
  const records: string[] = [];
  const authorized = createOneShotTestResendMailer({
    environmentIsDev: () => true,
    authorize: async () => {
      if (attemptState !== "not_started") return false;
      attemptState = "authorized";
      return true;
    },
    record: async (_attempt, result) => {
      records.push(result);
      if (result === "accepted" || result === "unknown") attemptState = result;
    },
    sendProvider: async () => {
      oneProviderAttemptCount += 1;
      return { id: "mock-provider-accepted" };
    },
  });
  const message = {
    to: "recipient@example.invalid",
    subject: "synthetic only",
    html: "synthetic only",
    idempotencyKey: "one-shot-synthetic",
    oneShot: attempt,
  };
  const accepted = await authorized.send(message);
  assert.equal(accepted.id, "mock-provider-accepted");
  assert.equal(oneProviderAttemptCount, 1);
  assert.deepEqual(records, ["accepted"]);
  assert.equal((await authorized.send(message)).skipped, true);
  assert.equal(
    oneProviderAttemptCount,
    1,
    "consumed authorization cannot be reused",
  );

  attemptState = "not_started";
  let timeoutProviderCalls = 0;
  const timeoutMailer = createOneShotTestResendMailer({
    environmentIsDev: () => true,
    authorize: async () => {
      if (attemptState !== "not_started") return false;
      attemptState = "authorized";
      return true;
    },
    record: async (_attempt, result) => {
      if (result === "unknown") attemptState = "unknown";
    },
    sendProvider: async () => {
      timeoutProviderCalls += 1;
      throw new Error("mock timeout after request may have started");
    },
  });
  await assert.rejects(
    timeoutMailer.send(message),
    /One-shot provider result is unknown/,
  );
  const restartedMailer = createOneShotTestResendMailer({
    environmentIsDev: () => true,
    authorize: async () => attemptState === "not_started",
    record: async () => undefined,
    sendProvider: async () => {
      timeoutProviderCalls += 1;
      return { id: "must-not-retry" };
    },
  });
  assert.equal((await restartedMailer.send(message)).skipped, true);
  assert.equal(
    timeoutProviderCalls,
    1,
    "unknown timeout is never automatically retried after restart",
  );

  attemptState = "not_started";
  let concurrentProviderCalls = 0;
  const concurrentMailer = createOneShotTestResendMailer({
    environmentIsDev: () => true,
    authorize: async () => {
      if (attemptState !== "not_started") return false;
      attemptState = "authorized";
      return true;
    },
    record: async (_attempt, result) => {
      if (result === "accepted") attemptState = "accepted";
    },
    sendProvider: async () => {
      concurrentProviderCalls += 1;
      await Promise.resolve();
      return { id: "mock-concurrent-acceptance" };
    },
  });
  await Promise.all([
    concurrentMailer.send(message),
    concurrentMailer.send(message),
  ]);
  assert.equal(
    concurrentProviderCalls,
    1,
    "only one concurrent caller can pass the CAS mock",
  );

  let providerAlreadyStarted = false;
  let inFlightProviderCalls = 0;
  const inFlightMailer = createOneShotTestResendMailer({
    environmentIsDev: () => true,
    authorize: async () => true,
    record: async () => undefined,
    sendProvider: async () => {
      inFlightProviderCalls += 1;
      providerAlreadyStarted = true;
      return { id: "already-in-flight-mock" };
    },
  });
  const inFlightResult = await inFlightMailer.send(message);
  assert.equal(providerAlreadyStarted, true);
  assert.equal(inFlightResult.id, "already-in-flight-mock");
  assert.equal(
    inFlightProviderCalls,
    1,
    "shutdown cannot recall a provider request that has already started",
  );

  console.log("One-shot application safety tests passed (mock provider only).");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
