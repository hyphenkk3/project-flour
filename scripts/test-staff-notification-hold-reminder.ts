/** Focused Fresh Pick Walk-in Hold reminder safety tests. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  deliverPendingStaffNotificationEmails,
  type ClaimedStaffNotificationEmail,
} from "../src/foundation/staff/staff-notification-dispatch";
import { LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED } from "../src/foundation/staff/legacy-staff-notification-email-pause";
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
  // The SQL still checks stale hold identity before a claim can be sent.
  // The current application pause must prevent even a claim or validation call.
  assert.equal(LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED, true);
  const payload = {
    extra_stock_id: "stock-a",
    walk_in_held_at: "2026-10-07T09:45:00.000Z",
    walk_in_held_until: "2026-10-07T10:00:00.000Z",
    walk_in_held_by: "owner-1",
  };
  for (const code of [
    "fresh_pick_walk_in_hold_reminder",
    "order_paid",
  ] as const) {
    let calls = 0;
    const result = await deliverPendingStaffNotificationEmails({
      claimer: async () => {
        calls += 1;
        return [{ ...baseClaim, code, payload }];
      },
      mailer: {
        async send() {
          calls += 1;
          throw new Error("paused mailer called");
        },
      },
      validateFreshPickHoldReminder: async () => {
        calls += 1;
        return false;
      },
      suppressDelivery: async () => {
        calls += 1;
      },
      completeDelivery: async () => {
        calls += 1;
      },
    });
    assert.deepEqual(result, [], `${code} must not dispatch while paused`);
    assert.equal(
      calls,
      0,
      `${code} must not claim, validate, complete, or send`,
    );
  }
}

testPreSendSuppression()
  .then(() => console.log("Staff notification hold reminder tests passed."))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
