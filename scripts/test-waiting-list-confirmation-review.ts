/**
 * Phase C — Waiting List staff confirmation link + customer details review (static).
 * Run: npx tsx scripts/test-waiting-list-confirmation-review.ts
 *
 * Does not create waiting-list rows or orders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { calculateCommercialSubtotal } from "@/engines/orders/totals";
import { buildWhatsAppDeepLink } from "@/engines/orders/whatsapp";
import {
  eligibleWaitingListConfirmationItems,
  formatWaitingListConfirmationReviewCopy,
  parseStaffWaitingListConfirmationLinks,
  parseWaitingListConfirmationReview,
  WAITING_LIST_CONFIRMATION_EXPIRED_LABEL,
  WAITING_LIST_CONFIRMATION_GENERATE_LABEL,
  WAITING_LIST_CONFIRMATION_INVALIDATED_LABEL,
  WAITING_LIST_CONFIRMATION_ISSUED_LABEL,
  WAITING_LIST_CONFIRMATION_SUBMITTED_LABEL,
  waitingListConfirmationDeadlineLabel,
} from "@/engines/waiting-list/confirmation-review";
import {
  waitingListConfirmationQuantitiesFromSnapshot,
  waitingListConfirmationRejectsItemInjection,
} from "@/engines/waiting-list/confirmation-page";
import {
  buildWaitingListConfirmationWhatsAppMessage,
  waitingListConfirmationCustomerPath,
  waitingListConfirmationCustomerUrl,
  waitingListConfirmationItemLine,
  waitingListConfirmationWhatsAppUrl,
} from "@/engines/waiting-list/confirmation-whatsapp";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const staffSql = readSrc(
  "supabase/migrations/20260920200000_waiting_list_confirmation_staff_review.sql",
);
const issueSql = readSrc(
  "supabase/migrations/20260920180000_waiting_list_confirmation_links.sql",
);
const submitSql = readSrc(
  "supabase/migrations/20260920190000_waiting_list_confirmation_submit.sql",
);
const boardSrc = readSrc("src/workspaces/waiting-list/WaitingListBoard.tsx");
const panelSrc = readSrc(
  "src/workspaces/waiting-list/WaitingListConfirmationStaffPanel.tsx",
);
const actionsSrc = readSrc("src/workspaces/waiting-list/actions.ts");
const serverSrc = readSrc("src/workspaces/waiting-list/confirmation-link.ts");
const queriesSrc = readSrc("src/workspaces/waiting-list/queries.ts");
const customerActionSrc = readSrc(
  "src/workspaces/storefront/waiting-list/confirmation-actions.ts",
);
const customerPageSrc = readSrc(
  "src/workspaces/storefront/waiting-list/WaitingListConfirmationPage.tsx",
);
const customerFormSrc = readSrc(
  "src/workspaces/storefront/waiting-list/WaitingListConfirmationForm.tsx",
);
const whatsappEngineSrc = readSrc("src/engines/orders/whatsapp.ts");
const whatsappHelperSrc = readSrc(
  "src/engines/waiting-list/confirmation-whatsapp.ts",
);

assert.equal(
  existsSync(
    resolve(
      process.cwd(),
      "src/workspaces/waiting-list/WaitingListConfirmationStaffPanel.tsx",
    ),
  ),
  true,
);

const listStart = staffSql.indexOf(
  "create or replace function public.staff_list_waiting_list_confirmation_links",
);
assert.ok(listStart >= 0);
const listSql = staffSql.slice(listStart);

const snapshot = [
  {
    waitingListItemId: "item-1",
    cakeId: "cake-a",
    cakeSizeId: "size-6",
    offeredQuantity: 1,
  },
  {
    waitingListItemId: "item-2",
    cakeId: "cake-b",
    cakeSizeId: "size-6",
    offeredQuantity: 1,
  },
];

const eligible = eligibleWaitingListConfirmationItems([
  {
    itemId: "item-1",
    cakeName: "Japanese Strawberry",
    sizeLabel: '6"',
    quantity: 1,
    status: "contacted",
    offeredQuantity: 1,
  },
  {
    itemId: "item-2",
    cakeName: "Chocolate D'Amour",
    sizeLabel: '6"',
    quantity: 1,
    status: "contacted",
    offeredQuantity: 1,
  },
  {
    itemId: "item-3",
    cakeName: "Earl Grey",
    sizeLabel: '6"',
    quantity: 1,
    status: "active",
    offeredQuantity: null,
  },
]);

// 1. Staff can issue a request-level confirmation link.
assert.match(actionsSrc, /issueWaitingListConfirmationLinkAction/);
assert.match(actionsSrc, /issueWaitingListConfirmationLink\(requestId\)/);
assert.match(panelSrc, /WAITING_LIST_CONFIRMATION_GENERATE_LABEL/);
assert.equal(
  WAITING_LIST_CONFIRMATION_GENERATE_LABEL,
  "Generate Confirmation Link",
);
assert.match(serverSrc, /issue_waiting_list_confirmation_link/);
assert.match(serverSrc, /p_request_id: id/);
assert.doesNotMatch(panelSrc, /p_token_hash/);
assert.doesNotMatch(panelSrc, /hashWaitingListConfirmationToken/);
assert.doesNotMatch(boardSrc, /generateWaitingListConfirmationToken/);

// 2. Link contains all intended contacted items.
assert.deepEqual(
  eligible.map((item) => item.cakeName),
  ["Japanese Strawberry", "Chocolate D'Amour"],
);
assert.match(issueSql, /i\.status = 'contacted'/);
assert.match(panelSrc, /This confirmation includes:/);

// 3–4. Exact offered/hold quantities; partial offer uses offered, not requested.
assert.match(issueSql, /'offered_quantity', v_hold\.quantity/);
const partial = eligibleWaitingListConfirmationItems([
  {
    itemId: "item-1",
    cakeName: "Japanese Strawberry",
    sizeLabel: '6"',
    quantity: 3,
    status: "contacted",
    offeredQuantity: 2,
  },
]);
assert.deepEqual(partial, [
  {
    cakeName: "Japanese Strawberry",
    sizeLabel: '6"',
    quantity: 2,
    unitPrice: 0,
  },
]);
assert.notEqual(partial[0]?.quantity, 3);

// 5. Second issue while an active link exists does not create another link.
assert.match(
  issueSql,
  /A confirmation link is already issued for this request/,
);
assert.match(
  issueSql,
  /create unique index if not exists waiting_list_confirmation_links_one_issued_per_request_idx/,
);
assert.match(panelSrc, /issuingLock/);
assert.match(panelSrc, /disabled=\{issuing\}/);

// 6. Customer submission changes link state to submitted.
assert.match(submitSql, /status = 'submitted'/);
assert.match(queriesSrc, /staff_list_waiting_list_confirmation_links/);
assert.match(listSql, /when l\.status = 'submitted' then l\.submitted_payload/);
assert.equal(
  WAITING_LIST_CONFIRMATION_SUBMITTED_LABEL,
  "Customer details received",
);
assert.match(boardSrc, /WAITING_LIST_CONFIRMATION_SUBMITTED_LABEL/);

// 7–8. Submitted details appear in staff review, including multi-item lines.
const review = parseWaitingListConfirmationReview({
  payload: {
    customer_name: "Aisha",
    phone: "0123456789",
    pickup_date: "2026-09-26",
    pickup_time: "14:00",
    fulfilment_method: "delivery",
    notes: "Please call on arrival",
    include_receipt: true,
    delivery: {
      recipient_name: "Aisha",
      recipient_phone: "0123456789",
      address_line_1: "1 Test Road",
      address_line_2: "",
      postcode: "88800",
      city: "Kota Kinabalu",
      state: "Sabah",
      recipient_notify_preference: "inform_recipient",
    },
    complimentary: [{ name: "Candles", quantity: 1 }],
    paid_addons: [
      { code: "birthday_card", quantity: 1, messages: ["Happy Birthday"] },
    ],
    items: [{ cake_id: "injected", quantity: 99 }],
    total: 1,
  },
  items: [
    {
      cakeName: "Japanese Strawberry",
      sizeLabel: '6"',
      quantity: 1,
      unitPrice: 180,
    },
    {
      cakeName: "Chocolate D'Amour",
      sizeLabel: '6"',
      quantity: 1,
      unitPrice: 180,
    },
  ],
  paidAddonCatalog: [
    { code: "birthday_card", name: "Birthday card", unitPrice: 8 },
  ],
});
assert.ok(review);
assert.equal(review?.customerName, "Aisha");
assert.equal(review?.fulfilmentLabel, "Delivery");
assert.equal(review?.items.length, 2);
assert.equal(review?.items[0]?.quantity, 1);
assert.equal(
  review?.items.some((item) => item.quantity === 99),
  false,
);
assert.match(
  formatWaitingListConfirmationReviewCopy(review!),
  /Japanese Strawberry · 6" × 1/,
);
assert.match(
  formatWaitingListConfirmationReviewCopy(review!),
  /Chocolate D'Amour · 6" × 1/,
);
assert.equal(
  review?.reviewTotal,
  calculateCommercialSubtotal({
    items: [
      { unitPrice: 180, quantity: 1 },
      { unitPrice: 180, quantity: 1 },
    ],
    paidAddons: [{ unitPrice: 8, quantity: 1 }],
  }),
);
assert.notEqual(review?.reviewTotal, 1);
assert.match(panelSrc, /Review customer details/);
assert.doesNotMatch(panelSrc, /JSON\.stringify\(effectiveLink/);
assert.doesNotMatch(panelSrc, /submitted_payload/);
assert.doesNotMatch(boardSrc, /token_hash/);

const dineInReview = parseWaitingListConfirmationReview({
  payload: {
    customer_name: "Mei",
    phone: "0191112222",
    pickup_date: "2026-09-26",
    pickup_time: "15:00",
    fulfilment_method: "dine_in",
    dine_in: {
      venue: "whitebird",
      guest_count: 4,
      reservation_time: "14:30",
      reservation_note: "Window table",
    },
  },
  items: [
    {
      cakeName: "Japanese Strawberry",
      sizeLabel: '6"',
      quantity: 1,
      unitPrice: 180,
    },
  ],
});
assert.equal(dineInReview?.fulfilmentLabel, "Dine-in");
assert.equal(dineInReview?.dineIn?.venue, "Whitebird");
assert.equal(dineInReview?.dineIn?.guestCount, 4);

const parsedLinks = parseStaffWaitingListConfirmationLinks([
  {
    id: "link-1",
    request_id: "req-1",
    status: "submitted",
    expires_at: "2026-09-20T06:30:00.000Z",
    issued_at: "2026-09-20T06:00:00.000Z",
    submitted_at: "2026-09-20T06:10:00.000Z",
    items: [
      {
        cake_name: "Japanese Strawberry",
        size_label: '6"',
        quantity: 1,
        unit_price: 180,
      },
      {
        cake_name: "Chocolate D'Amour",
        size_label: '6"',
        quantity: 1,
        unit_price: 180,
      },
    ],
    submitted_payload: {
      customer_name: "Aisha",
      phone: "0123456789",
      pickup_date: "2026-09-26",
      pickup_time: "14:00",
      fulfilment_method: "pickup",
    },
  },
]);
assert.equal(parsedLinks[0]?.status, "submitted");
assert.equal(parsedLinks[0]?.items.length, 2);
assert.equal(parsedLinks[0]?.review?.items.length, 2);

// 9–10. Expired / invalidated labels.
assert.equal(
  WAITING_LIST_CONFIRMATION_EXPIRED_LABEL,
  "Confirmation link expired",
);
assert.equal(
  WAITING_LIST_CONFIRMATION_INVALIDATED_LABEL,
  "Confirmation link invalidated",
);
assert.equal(WAITING_LIST_CONFIRMATION_ISSUED_LABEL, "Confirmation link sent");
assert.match(listSql, /set status = 'expired'/);
assert.match(listSql, /and status = 'issued'/);
assert.match(listSql, /and expires_at <= now\(\)/);
assert.match(
  waitingListConfirmationDeadlineLabel("2026-09-20T06:30:00.000Z"),
  /Confirmation deadline:/,
);
assert.doesNotMatch(
  waitingListConfirmationDeadlineLabel("2026-09-20T06:30:00.000Z"),
  /30 minutes before/,
);
assert.doesNotMatch(panelSrc, /30 minutes before pickup/);
assert.doesNotMatch(staffSql, /30 minutes before/);

// 11. Customer cannot access staff review data.
assert.doesNotMatch(
  customerActionSrc,
  /staff_list_waiting_list_confirmation_links/,
);
assert.doesNotMatch(customerActionSrc, /submitted_payload/);
assert.doesNotMatch(customerPageSrc, /WaitingListConfirmationStaffPanel/);
assert.doesNotMatch(customerPageSrc, /Customer details received/);
const lookupStart = submitSql.indexOf(
  "create or replace function public.lookup_waiting_list_confirmation_link",
);
const submitStart = submitSql.indexOf(
  "create or replace function public.submit_waiting_list_confirmation",
);
const lookupSql = submitSql.slice(lookupStart, submitStart);
assert.doesNotMatch(lookupSql, /submitted_payload/);
assert.doesNotMatch(lookupSql, /token_hash', v_link/);
assert.match(
  staffSql,
  /revoke all on function public.staff_list_waiting_list_confirmation_links\(uuid, uuid\[\]\)\n {2}from public, anon/,
);
assert.match(
  staffSql,
  /grant execute on function public.staff_list_waiting_list_confirmation_links\(uuid, uuid\[\]\)\n {2}to authenticated/,
);
assert.doesNotMatch(listSql, /l\.token_hash/);
assert.match(listSql, /Does not return token_hash/);

// 12. Customer cannot change cake/size/quantity.
assert.equal(
  waitingListConfirmationRejectsItemInjection({
    snapshot,
    attemptedItems: [
      { cakeId: "cake-a", sizeId: "size-6", quantity: 2 },
      { cakeId: "cake-b", sizeId: "size-6", quantity: 1 },
    ],
  }),
  true,
);
assert.deepEqual(waitingListConfirmationQuantitiesFromSnapshot(snapshot), [
  { cakeId: "cake-a", sizeId: "size-6", quantity: 1 },
  { cakeId: "cake-b", sizeId: "size-6", quantity: 1 },
]);
assert.match(customerFormSrc, /Your Waiting List request/);
assert.doesNotMatch(panelSrc, /name="cake_id"/);
assert.doesNotMatch(panelSrc, /accepted_quantity/);

// 13–15. Phase C does not increment accepted_quantity, convert holds, or create orders.
assert.doesNotMatch(staffSql, /accepted_quantity\s*=/);
assert.doesNotMatch(listSql, /update public\.waiting_list_items/);
assert.doesNotMatch(staffSql, /waiting_list_convert_item/);
assert.doesNotMatch(staffSql, /insert into public\.orders/);
assert.doesNotMatch(staffSql, /create_staff_guest_preorder/);
assert.doesNotMatch(panelSrc, /waiting_list_convert_item/);
assert.doesNotMatch(
  actionsSrc,
  /issueWaitingListConfirmationLinkAction[\s\S]*accepted_quantity/,
);
assert.match(staffSql, /Does not create an order/);
assert.match(serverSrc, /Does not create an order/);

// WhatsApp reuses existing helper and stays request-level.
const message = buildWaitingListConfirmationWhatsAppMessage({
  customerName: "Aisha",
  pickupDate: "2026-09-26",
  items: [
    { cakeName: "Japanese Strawberry", sizeLabel: '6"', quantity: 1 },
    { cakeName: "Chocolate D'Amour", sizeLabel: '6"', quantity: 1 },
  ],
  confirmationUrl:
    "https://dev.whitebird.asia/order/waiting-list/confirm/raw-token",
  deadlineAt: "2026-09-20T06:30:00.000Z",
});
assert.match(message, /Hi Aisha/);
assert.match(message, /Japanese Strawberry · 6" × 1/);
assert.match(message, /Chocolate D'Amour · 6" × 1/);
assert.match(message, /\/order\/waiting-list\/confirm\/raw-token/);
assert.doesNotMatch(message, /order has been created/i);
assert.doesNotMatch(message, /payment is confirmed/i);
assert.doesNotMatch(message, /request_id=/);
assert.equal(
  waitingListConfirmationCustomerPath("abc_token"),
  "/order/waiting-list/confirm/abc_token",
);
assert.equal(
  waitingListConfirmationCustomerUrl(
    "abc_token",
    "https://dev.whitebird.asia/",
  ),
  "https://dev.whitebird.asia/order/waiting-list/confirm/abc_token",
);
assert.equal(
  waitingListConfirmationWhatsAppUrl("0123456789", message),
  buildWhatsAppDeepLink("0123456789", message),
);
assert.match(whatsappHelperSrc, /buildWhatsAppDeepLink/);
assert.match(whatsappEngineSrc, /export function buildWhatsAppDeepLink/);
assert.doesNotMatch(panelSrc, /https:\/\/wa\.me\//);
assert.match(panelSrc, /waitingListConfirmationWhatsAppUrl/);
assert.match(panelSrc, /Open WhatsApp/);
assert.match(panelSrc, /function handleOpenWhatsApp/);
const generateFn = panelSrc.slice(
  panelSrc.indexOf("function handleGenerate()"),
  panelSrc.indexOf("function handleCopyLink()"),
);
assert.doesNotMatch(generateFn, /window\.open/);
assert.equal(
  waitingListConfirmationItemLine({
    cakeName: "Japanese Strawberry",
    sizeLabel: '6"',
    quantity: 2,
  }),
  'Japanese Strawberry · 6" × 2',
);

// Request-level UI: one generate panel per request.
assert.match(boardSrc, /groupWaitingListHeadingByRequest/);
assert.match(boardSrc, /WaitingListConfirmationStaffPanel/);
assert.match(queriesSrc, /confirmationLink/);
assert.match(serverSrc, /waitingListConfirmationCustomerPath\(token\)/);
assert.doesNotMatch(serverSrc, /request_id=\$\{/);
assert.doesNotMatch(panelSrc, /router\.refresh\(/);

// No new staff-notification category in this phase.
assert.doesNotMatch(staffSql, /staff_notification_events/);
assert.doesNotMatch(staffSql, /waiting_list_customer_details/);
assert.match(submitSql, /confirmation_link_submitted/);

const historical = [
  "supabase/migrations/20260920120000_staff_notification_waiting_list_new_request.sql",
  "supabase/migrations/20260920140000_guest_waiting_list_closed_date.sql",
  "supabase/migrations/20260920160000_guest_waiting_list_multi_item.sql",
  "supabase/migrations/20260920180000_waiting_list_confirmation_links.sql",
  "supabase/migrations/20260920190000_waiting_list_confirmation_submit.sql",
];
for (const rel of historical) {
  assert.equal(existsSync(resolve(process.cwd(), rel)), true);
  assert.doesNotMatch(
    readSrc(rel),
    /staff_list_waiting_list_confirmation_links/,
  );
}

console.log("waiting-list confirmation review tests passed");
