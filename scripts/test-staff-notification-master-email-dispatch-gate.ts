import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createResendStaffNotificationMailer,
  deliverPendingStaffNotificationEmails,
} from "../src/foundation/staff/staff-notification-dispatch";

const candidateRoot = process.cwd();
const read = (path: string) =>
  readFileSync(resolve(candidateRoot, path), "utf8");

async function main() {
  let claimCount = 0;
  let sendCount = 0;
  const dispatches = await deliverPendingStaffNotificationEmails({
    dispatchEnabled: async () => false,
    claimer: async () => {
      claimCount += 1;
      return [];
    },
    mailer: {
      async send() {
        sendCount += 1;
        return { id: "synthetic" };
      },
    },
  });
  assert.deepEqual(dispatches, []);
  assert.equal(claimCount, 0, "disabled gate must stop before claim RPC");
  assert.equal(sendCount, 0, "disabled gate must stop before provider");

  for (const failingGate of [
    async () => {
      throw new Error("database read failed");
    },
    async () => false,
    async () => null as unknown as boolean,
  ]) {
    const result = await deliverPendingStaffNotificationEmails({
      dispatchEnabled: failingGate,
      claimer: async () => {
        claimCount += 1;
        return [];
      },
    });
    assert.deepEqual(result, []);
  }
  assert.equal(claimCount, 0, "failed/missing config must fail closed");

  const resendMailer = createResendStaffNotificationMailer(async () => false);
  const skippedProviderAttempt = await resendMailer.send({
    to: "synthetic@example.invalid",
    subject: "Synthetic safety test",
    html: "<p>not sent</p>",
    idempotencyKey: "synthetic-only",
  });
  assert.equal(skippedProviderAttempt.skipped, true);

  const syntheticClaim = {
    deliveryId: "delivery-1",
    eventId: "event-1",
    staffId: "staff-1",
    staffEmail: "staff@example.invalid",
    claimedUntil: "2026-10-08T00:02:00.000Z",
    eventKey: "order_paid:synthetic-order",
    code: "order_paid",
    title: "Payment recorded",
    description: "Synthetic event",
    href: null,
    payload: {},
    orderId: null,
  };

  let gateChecks = 0;
  let midFlightSendCount = 0;
  let midFlightStatusUpdates = 0;
  const midFlightResult = await deliverPendingStaffNotificationEmails({
    dispatchEnabled: async () => {
      gateChecks += 1;
      return gateChecks === 1;
    },
    claimer: async () => [syntheticClaim],
    mailer: {
      async send() {
        midFlightSendCount += 1;
        return { id: "must-not-send" };
      },
    },
    completeDelivery: async () => {
      midFlightStatusUpdates += 1;
    },
  });
  assert.equal(midFlightResult[0]?.skipped, 1);
  assert.equal(midFlightSendCount, 0);
  assert.equal(midFlightStatusUpdates, 0);

  gateChecks = 0;
  const enabledResult = await deliverPendingStaffNotificationEmails({
    dispatchEnabled: async () => {
      gateChecks += 1;
      return true;
    },
    claimer: async () => [syntheticClaim],
    mailer: {
      async send() {
        sendCount += 1;
        return { id: "synthetic-provider-acceptance" };
      },
    },
    completeDelivery: async () => undefined,
  });
  assert.equal(enabledResult[0]?.sent, 1);
  assert.equal(gateChecks, 2, "enabled flow checks before claim and send");
  assert.equal(sendCount, 1, "only the synthetic mock is called");

  const gate = read(
    "src/foundation/staff/staff-notification-email-dispatch-gate.ts",
  );
  const dispatcher = read(
    "src/foundation/staff/staff-notification-dispatch.ts",
  );
  assert.match(gate, /staff_notification_email_dispatch_is_enabled/);
  assert.match(gate, /return !error && data === true/);
  assert.match(gate, /catch[\s\S]*?return false/);
  assert.match(
    dispatcher,
    /if \(!\(await isDispatchEnabled\(dispatchEnabled\)\)\) return \[\]/,
    "missing or disabled gate stops before claims",
  );
  const recipientGateIndex = dispatcher.indexOf(
    "input.dispatchEnabled ?? isStaffNotificationEmailDispatchEnabled",
  );
  const recipientProcessingIndex = dispatcher.indexOf(
    "const sendCheck = await input.beforeSend?.(recipient)",
  );
  assert.ok(
    recipientGateIndex >= 0 && recipientGateIndex < recipientProcessingIndex,
    "each recipient is checked before processing",
  );
  assert.match(
    dispatcher,
    /if \(!\(await isDispatchEnabled\(dispatchEnabled\)\)\) return \{ skipped: true \}/,
    "provider boundary checks the gate immediately before send",
  );

  const scheduler = read(
    "src/foundation/staff/schedule-staff-notification-dispatch.ts",
  );
  assert.match(scheduler, /deliverPendingStaffNotificationEmails/);
  const applicationRoute = read(
    "src/app/api/staff/notifications/dispatch/route.ts",
  );
  assert.match(
    applicationRoute,
    /deliver:\s*\(scope\)\s*=>\s*deliverPendingStaffNotificationEmails\(scope\)/,
  );
  const route = read(
    "src/foundation/staff/staff-notification-dispatch-route.ts",
  );
  assert.match(route, /deliver\(/);
  assert.match(route, /dependencies\.authorize\(request\)/);
  assert.match(route, /validateTargetedBody/);
  console.log(
    "Application-only master staff email dispatch gate tests passed (synthetic only).",
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
