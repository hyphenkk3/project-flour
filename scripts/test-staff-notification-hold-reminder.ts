/** Focused Fresh Pick Walk-in Hold reminder safety tests. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  deliverPendingStaffNotificationEmails,
  type ClaimedStaffNotificationEmail,
} from "../src/foundation/staff/staff-notification-dispatch";
import {
  isStaffNotificationEmailDeliveryClaimable,
  type StaffNotificationEmailDeliveryState,
} from "../src/foundation/staff/staff-notification-dispatch-queue";

const migration = readFileSync(
  resolve(
    "supabase/migrations/20261007120000_staff_notification_fresh_pick_hold_stale_suppression.sql",
  ),
  "utf8",
);
const reliabilityMigration = readFileSync(
  resolve(
    "supabase/migrations/20260903160000_staff_notification_reliability.sql",
  ),
  "utf8",
);

const holdValidator =
  migration
    .split(
      "create or replace function public.staff_notification_fresh_pick_hold_reminder_is_current",
    )[1]
    ?.split("$$;")[0] ?? "";
const claimFunction =
  migration
    .split(
      "create or replace function public.claim_staff_notification_email_deliveries",
    )[1]
    ?.split("$$;")[0] ?? "";
const reminderSweep =
  migration
    .split(
      "create or replace function public.sweep_extra_walk_in_hold_reminders",
    )[1]
    ?.split("$$;")[0] ?? "";

assert.match(
  migration,
  /status in \('sent', 'failed', 'claimed', 'suppressed'\)/,
);
assert.match(migration, /p_status in \('claimed', 'failed'\)/);
assert.match(reliabilityMigration, /unique \(event_id, staff_id\)/i);
assert.match(migration, /on conflict \(event_id, staff_id\)/i);
assert.match(holdValidator, /extra_stock_id/);
assert.match(holdValidator, /walk_in_held_at/);
assert.match(holdValidator, /walk_in_held_until/);
assert.match(holdValidator, /walk_in_held_by/);
assert.match(holdValidator, /for update/i);
assert.match(holdValidator, /lifecycle = 'confirmed'/);
assert.match(holdValidator, /sold_at is null/i);
assert.match(holdValidator, /cut_into_slices_at is null/i);
assert.match(holdValidator, /walk_in_held_until = v_held_until/i);
assert.match(holdValidator, /walk_in_held_at = v_held_at/i);
assert.match(holdValidator, /walk_in_held_by = v_held_by/i);
assert.match(
  holdValidator,
  /extra_walk_in_hold_is_active\([\s\S]*clock_timestamp\(\)/i,
);
assert.match(reminderSweep, /'walk_in_held_at', stock_row\.walk_in_held_at/i);
assert.match(
  claimFunction,
  /e\.code is distinct from 'fresh_pick_walk_in_hold_reminder'[\s\S]*staff_notification_fresh_pick_hold_reminder_is_current\(e\.payload\)/i,
);
assert.match(claimFunction, /coalesce\(pref\.email_enabled, true\)/i);
assert.match(claimFunction, /sp\.is_active = true/i);
assert.match(claimFunction, /on conflict \(event_id, staff_id\)/i);
assert.match(
  migration,
  /status = 'suppressed'[\s\S]*next_attempt_at = null[\s\S]*claimed_until = null/i,
);

const now = new Date("2026-10-07T10:00:00.000Z");
const terminalSuppressed: StaffNotificationEmailDeliveryState = {
  staffId: "owner-1",
  status: "suppressed",
  attemptCount: 0,
  nextAttemptAt: null,
  claimedUntil: new Date("2026-10-07T09:00:00.000Z"),
};
assert.equal(
  isStaffNotificationEmailDeliveryClaimable(terminalSuppressed, now),
  false,
);

const retryableFailure: StaffNotificationEmailDeliveryState = {
  staffId: "owner-1",
  status: "failed",
  attemptCount: 1,
  nextAttemptAt: new Date("2026-10-07T09:59:00.000Z"),
  claimedUntil: null,
};
assert.equal(
  isStaffNotificationEmailDeliveryClaimable(retryableFailure, now),
  true,
);

const baseClaim: Omit<ClaimedStaffNotificationEmail, "code" | "payload"> = {
  deliveryId: "delivery-1",
  eventId: "event-1",
  staffId: "owner-1",
  staffEmail: "owner@example.test",
  claimedUntil: "2026-10-07T10:02:00.000Z",
  eventKey: "fresh_pick_walk_in_hold_reminder:stock-1:expiry",
  title: "Fresh Pick walk-in hold",
  description: "Fresh Pick hold expires soon",
  href: "/customer-operations/fresh-picks",
  orderId: null,
};

async function testPreSendSuppression() {
  const exactActivePayload = {
    extra_stock_id: "stock-a",
    walk_in_held_at: "2026-10-07T09:45:00.000Z",
    walk_in_held_until: "2026-10-07T10:00:00.000Z",
    walk_in_held_by: "owner-1",
  };
  const reminder = (
    payload: Record<string, unknown>,
  ): ClaimedStaffNotificationEmail => ({
    ...baseClaim,
    code: "fresh_pick_walk_in_hold_reminder",
    payload,
  });

  let sendCount = 0;
  let validationCount = 0;
  const activeResult = await deliverPendingStaffNotificationEmails({
    dispatchEnabled: async () => true,
    claimer: async () => [reminder(exactActivePayload)],
    mailer: {
      async send() {
        sendCount += 1;
        return { id: "resend-active" };
      },
    },
    validateFreshPickHoldReminder: async ({ payload }) => {
      validationCount += 1;
      assert.deepEqual(payload, exactActivePayload);
      return true;
    },
    suppressDelivery: async () => {
      assert.fail("active exact hold must not be suppressed");
    },
    completeDelivery: async ({ status }) => {
      assert.equal(status, "sent");
    },
  });
  assert.equal(activeResult[0]?.sent, 1);
  assert.equal(activeResult[0]?.suppressed, 0);
  assert.equal(validationCount, 1);
  assert.equal(sendCount, 1);

  const staleCases = [
    "expired",
    "released",
    "extended-expiry-mismatch",
    "replacement-hold-mismatch",
  ];
  for (const staleCase of staleCases) {
    let staleSendCount = 0;
    let suppressed = 0;
    const payload = { ...exactActivePayload, testCase: staleCase };
    const staleResult = await deliverPendingStaffNotificationEmails({
      dispatchEnabled: async () => true,
      claimer: async () => [reminder(payload)],
      mailer: {
        async send() {
          staleSendCount += 1;
          return { id: "must-not-send" };
        },
      },
      validateFreshPickHoldReminder: async ({ payload: checked }) => {
        assert.deepEqual(checked, payload);
        return false;
      },
      suppressDelivery: async (input) => {
        suppressed += 1;
        assert.equal(input.eventId, "event-1");
        assert.equal(input.staffId, "owner-1");
        assert.match(input.reason, /no longer active|no longer matches/i);
      },
      completeDelivery: async () => {
        assert.fail(
          "suppressed deliveries must not use sent/failed completion",
        );
      },
    });
    assert.equal(staleResult[0]?.sent, 0, staleCase);
    assert.equal(staleResult[0]?.suppressed, 1, staleCase);
    assert.equal(staleResult[0]?.failed, 0, staleCase);
    assert.equal(staleSendCount, 0, staleCase);
    assert.equal(suppressed, 1, staleCase);
  }

  let otherEventValidationCount = 0;
  let otherEventSendCount = 0;
  const otherResult = await deliverPendingStaffNotificationEmails({
    dispatchEnabled: async () => true,
    claimer: async () => [
      {
        ...baseClaim,
        code: "order_paid",
        payload: exactActivePayload,
      },
    ],
    mailer: {
      async send() {
        otherEventSendCount += 1;
        return { id: "resend-order-paid" };
      },
    },
    validateFreshPickHoldReminder: async () => {
      otherEventValidationCount += 1;
      return false;
    },
    suppressDelivery: async () => {
      assert.fail(
        "other event types must not be suppressed by hold validation",
      );
    },
    completeDelivery: async ({ status }) => {
      assert.equal(status, "sent");
    },
  });
  assert.equal(otherResult[0]?.sent, 1);
  assert.equal(otherEventSendCount, 1);
  assert.equal(otherEventValidationCount, 0);
}

testPreSendSuppression()
  .then(() => console.log("Staff notification hold reminder tests passed."))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
