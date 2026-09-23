/**
 * Customer-facing Dine-in reservation notes (display only).
 * Run: npx tsx scripts/test-dine-in-reservation-notes.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DINE_IN_RESERVATION_NOTES_HEADING,
  DINE_IN_RESERVATION_RULES,
} from "@/engines/orders/dine-in-party";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

assert.equal(DINE_IN_RESERVATION_NOTES_HEADING, "Please note:");
assert.deepEqual(DINE_IN_RESERVATION_RULES, [
  "Only light food is available after 5:00 PM on weekends.",
  "Specific table requests may not be fulfilled.",
  "Your table will be automatically cancelled if you do not arrive within 10 minutes of your reservation time.",
]);

const notice = read(
  "src/workspaces/storefront/checkout/DineInReservationNotesNotice.tsx",
);
assert.match(notice, /DINE_IN_RESERVATION_NOTES_HEADING/);
assert.match(notice, /DINE_IN_RESERVATION_RULES/);
assert.match(notice, /text-status-danger space-y-2/);
assert.match(notice, /text-sm leading-snug font-bold/);
assert.match(notice, /list-disc space-y-1.5 pl-5 text-sm leading-relaxed/);
assert.doesNotMatch(notice, /text-ink/);
assert.doesNotMatch(notice, /FormCheckbox|type="checkbox"/);
assert.doesNotMatch(
  notice,
  /The following conditions apply to all dine-in reservations/,
);
assert.doesNotMatch(notice, /WHITEBIRD NIGHT DESSERT MENU/);

const checkout = read("src/workspaces/storefront/checkout/GuestCheckoutForm.tsx");
const extra = read("src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx");
const waiting = read(
  "src/workspaces/storefront/waiting-list/WaitingListConfirmationForm.tsx",
);
const assisted = read(
  "src/workspaces/customer-operations/orders/AssistedOrderFulfilmentFields.tsx",
);
const owner = read("src/workspaces/owner/orders/OrderWorkspaceForm.tsx");

assert.match(checkout, /DineInReservationNotesNotice/);
assert.match(extra, /DineInReservationNotesNotice/);
assert.match(waiting, /DineInReservationNotesNotice/);
assert.doesNotMatch(assisted, /DineInReservationNotesNotice/);
assert.doesNotMatch(owner, /DineInReservationNotesNotice/);

function noticeBeforeReservationNote(src: string) {
  assert.match(
    src,
    /<DineInReservationNotesNotice \/>\s*<FormField[\s\S]*?label="Reservation note"/,
  );
}

noticeBeforeReservationNote(checkout);
noticeBeforeReservationNote(extra);
noticeBeforeReservationNote(waiting);

assert.equal(
  checkout.split("<DineInReservationNotesNotice").length - 1,
  1,
);
assert.equal(extra.split("<DineInReservationNotesNotice").length - 1, 1);
assert.equal(waiting.split("<DineInReservationNotesNotice").length - 1, 1);

assert.match(
  checkout,
  /\{fields\.fulfilmentMethod === "dine_in" \? \([\s\S]*<DineInReservationNotesNotice \/>/,
);
assert.match(
  extra,
  /\{resolvedMethod === "dine_in" \? \([\s\S]*<DineInReservationNotesNotice \/>[\s\S]*\{resolvedMethod === "delivery"/,
);
assert.match(
  waiting,
  /\{fulfilmentMethod === "dine_in" \? \([\s\S]*<DineInReservationNotesNotice \/>/,
);

assert.doesNotMatch(
  extra.slice(extra.indexOf('{resolvedMethod === "delivery"')),
  /DineInReservationNotesNotice/,
);

for (const src of [checkout, extra, waiting, notice]) {
  assert.doesNotMatch(
    src,
    /The following conditions apply to all dine-in reservations/,
  );
  assert.doesNotMatch(src, /WHITEBIRD NIGHT DESSERT MENU/);
  assert.doesNotMatch(src, /Refer to WHITEBIRD NIGHT DESSERT MENU/);
}

assert.match(extra, /whitebirdSplitSeatingAcknowledged/);
assert.doesNotMatch(notice, /disabled=\{!/);

console.log("test-dine-in-reservation-notes: ok");
