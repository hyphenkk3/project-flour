import assert from "node:assert/strict";

import {
  LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED,
  runUnlessLegacyStaffNotificationEmailIsPaused,
} from "@/foundation/staff/legacy-staff-notification-email-pause";
import {
  createResendStaffNotificationMailer,
  deliverPendingStaffNotificationEmails,
  deliverStaffNotificationEmailsToRecipients,
} from "@/foundation/staff/staff-notification-dispatch";
import { scheduleStaffNotificationDispatch } from "@/foundation/staff/schedule-staff-notification-dispatch";

process.env.STAFF_NOTIFICATION_DISPATCH_SECRET = "synthetic-local-test-secret";

const { GET, POST } =
  await import("@/app/api/staff/notifications/dispatch/route");

async function main(): Promise<void> {
  assert.equal(LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED, true);

  let callbackCalls = 0;
  assert.equal(
    runUnlessLegacyStaffNotificationEmailIsPaused(() => {
      callbackCalls += 1;
      return "started";
    }),
    undefined,
  );
  assert.equal(callbackCalls, 0, "pause helper must not start its callback");

  // The real scheduler function is exercised. It must return without scheduling
  // Next's after callback or invoking the legacy worker.
  assert.doesNotThrow(() =>
    scheduleStaffNotificationDispatch("synthetic-event"),
  );

  let claimCalls = 0;
  let sendCalls = 0;
  let completionCalls = 0;
  const workerResults = await deliverPendingStaffNotificationEmails({
    eventId: "synthetic-event",
    claimer: async () => {
      claimCalls += 1;
      return [];
    },
    mailer: {
      send: async () => {
        sendCalls += 1;
        return { id: "synthetic-provider-id" };
      },
    },
    completeDelivery: async () => {
      completionCalls += 1;
    },
  });
  assert.deepEqual(workerResults, []);
  assert.equal(claimCalls, 0, "paused worker must not claim deliveries");
  assert.equal(
    sendCalls,
    0,
    "paused worker must not call its provider adapter",
  );
  assert.equal(
    completionCalls,
    0,
    "paused worker must not finalize deliveries",
  );

  const recipientResults = await deliverStaffNotificationEmailsToRecipients({
    eventId: "synthetic-event",
    eventKey: "synthetic-event-key",
    content: {
      code: "new_order",
      title: "Synthetic test",
      description: "No delivery should occur.",
      href: null,
    },
    recipients: [{ staffId: "synthetic-staff", email: "test@example.invalid" }],
    mailer: {
      send: async () => {
        sendCalls += 1;
        return { id: "synthetic-provider-id" };
      },
    },
  });
  assert.equal(recipientResults.sent, 0);
  assert.equal(recipientResults.suppressed, 1);
  assert.equal(sendCalls, 0, "direct recipient helper must remain paused");

  const originalFetch = globalThis.fetch;
  let providerFetchCalls = 0;
  globalThis.fetch = async () => {
    providerFetchCalls += 1;
    throw new Error("Unexpected network access in local test.");
  };
  try {
    await assert.rejects(
      createResendStaffNotificationMailer().send({
        to: "test@example.invalid",
        subject: "Synthetic",
        html: "<p>Synthetic</p>",
        idempotencyKey: "synthetic-only",
      }),
      /paused/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(
    providerFetchCalls,
    0,
    "provider adapter must stop before network I/O",
  );

  for (const [method, handler] of [
    ["GET", GET],
    ["POST", POST],
  ] as const) {
    const unauthorizedRequest = new Request(
      "https://local.invalid/api/staff/notifications/dispatch",
      {
        method,
        headers: { "content-type": "application/json" },
        ...(method === "POST"
          ? { body: JSON.stringify({ eventId: "synthetic-event" }) }
          : {}),
      },
    );
    const unauthorizedResponse = await handler(unauthorizedRequest);
    assert.equal(unauthorizedResponse.status, 401);
    assert.deepEqual(await unauthorizedResponse.json(), {
      error: "Unauthorized.",
    });

    const request = new Request(
      "https://local.invalid/api/staff/notifications/dispatch",
      {
        method,
        headers: {
          authorization: "Bearer synthetic-local-test-secret",
          "content-type": "application/json",
        },
        ...(method === "POST"
          ? { body: JSON.stringify({ eventId: "synthetic-event" }) }
          : {}),
      },
    );
    const response = await handler(request);
    assert.equal(response.status, 503, `${method} must return paused status`);
    assert.deepEqual(await response.json(), {
      error: "Staff email dispatch is paused.",
    });
  }

  assert.equal(claimCalls, 0);
  assert.equal(sendCalls, 0);
  assert.equal(completionCalls, 0);
  assert.equal(providerFetchCalls, 0);

  console.log("PASS: legacy staff email pause bridge worker/route assertions");
}

await main();
