/**
 * Guest preorder submission copy email (customer opt-in).
 * Run: npx tsx scripts/test-guest-preorder-copy-email.ts
 *
 * Does not send live email or submit orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildGuestPreorderCopyEmail } from "@/workspaces/storefront/checkout/guest-preorder-copy-email-content";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const copy = buildGuestPreorderCopyEmail({
  customerName: "YC Wee",
  orderNumber: "WB-1001",
  items: [
    {
      cakeName: "Avocado <Cake>",
      sizeLabel: '6"',
      quantity: 1,
      unitPrice: 88,
    },
  ],
  fulfilmentMethod: "pickup",
  pickupDate: "2026-09-12",
  pickupTime: "14:00",
  dineInVenue: null,
  reservationTime: null,
  guestCount: null,
  total: 88,
});

assert.match(copy.subject, /Whitebird preorder received/);
assert.match(copy.subject, /WB-1001/);
assert.match(copy.html, /Dear YC Wee/);
assert.match(copy.html, /Order Received/);
assert.match(copy.html, /Payment Pending/);
assert.match(copy.html, /Whitebird will contact you via WhatsApp/);
assert.match(copy.html, /Avocado &lt;Cake&gt;/);
assert.doesNotMatch(copy.html, /Avocado <Cake>/);
assert.match(copy.html, /RM88/);
assert.match(copy.html, /12\/09\/2026/);

const emailModuleSrc = readSrc(
  "src/workspaces/storefront/checkout/guest-preorder-copy-email.ts",
);
const emailContentSrc = readSrc(
  "src/workspaces/storefront/checkout/guest-preorder-copy-email-content.ts",
);
assert.match(emailModuleSrc, /from: "Whitebird <onboarding@resend.dev>"/);
assert.match(emailModuleSrc, /RESEND_API_KEY/);
assert.match(emailModuleSrc, /idempotencyKey: `guest-preorder-copy:\$\{input\.orderId\}`/);
assert.match(emailModuleSrc, /if \(!input\.requested \|\| !input\.email\.trim\(\)\) return/);
assert.match(emailModuleSrc, /\[guest-preorder-copy\] Email delivery failed/);
assert.match(emailModuleSrc, /after\(run\)/);
assert.match(emailModuleSrc, /buildGuestPreorderCopyEmail/);
assert.match(emailContentSrc, /Order Received/);
assert.match(emailContentSrc, /Payment Pending/);
assert.doesNotMatch(emailModuleSrc, /staff_notification_events/);
assert.doesNotMatch(emailModuleSrc, /deliverPendingStaffNotificationEmails/);
assert.doesNotMatch(emailModuleSrc, /scheduleStaffNotificationDispatch/);

const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
assert.match(actionsSrc, /scheduleStaffNotificationDispatch\(\)/);
assert.match(actionsSrc, /scheduleGuestPreorderCopyEmail/);
assert.match(actionsSrc, /requested: receiptRequested/);
assert.match(actionsSrc, /email,/);
assert.match(actionsSrc, /return \{ error: null, orderId \}/);
assert.doesNotMatch(
  actionsSrc,
  /redirect\(`\/order\/success\?order=\$\{orderId\}`\)/,
);

const staffDispatchSrc = readSrc(
  "src/foundation/staff/staff-notification-dispatch.ts",
);
assert.doesNotMatch(staffDispatchSrc, /scheduleGuestPreorderCopyEmail/);
assert.doesNotMatch(staffDispatchSrc, /guest-preorder-copy/);
assert.match(staffDispatchSrc, /from: "Whitebird <onboarding@resend.dev>"/);

const formSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(formSrc, /name="email_submission_receipt_requested"/);
assert.match(formSrc, /Email me a copy of my preorder submission/);
assert.match(
  formSrc,
  /window\.location\.assign\(`\/order\/success\?order=\$\{orderId\}`\)/,
);

const extraActionsSrc = readSrc(
  "src/workspaces/storefront/extra/actions.ts",
);
assert.doesNotMatch(extraActionsSrc, /scheduleGuestPreorderCopyEmail/);

console.log("PASS guest preorder copy email wiring");
