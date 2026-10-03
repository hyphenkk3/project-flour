/** Customer Order Notes flow from checkout to Bakery and staff order details. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OPTIONAL_NOTES_CUSTOMER_WARNING } from "@/engines/orders/order-guide";
import { mapCollectionBoardOrder } from "@/workspaces/collection/map-order";
import { COLLECTION_ORDER_SELECT } from "@/workspaces/collection/select";

const checkoutForm = readFileSync(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
  "utf8",
);
const checkoutAction = readFileSync(
  "src/workspaces/storefront/checkout/actions.ts",
  "utf8",
);
const submitMigration = readFileSync(
  "supabase/migrations/20260922180000_guest_preorder_delivery_processing_ack.sql",
  "utf8",
);
const ownerQueries = readFileSync("src/workspaces/owner/orders/queries.ts", "utf8");
const ownerDetail = readFileSync(
  "src/workspaces/owner/orders/OrderWorkspaceForm.tsx",
  "utf8",
);
const collectionDetail = readFileSync(
  "src/workspaces/collection/CollectionOrderDetail.tsx",
  "utf8",
);
const collectionCard = readFileSync(
  "src/workspaces/collection/CollectionOrderCard.tsx",
  "utf8",
);
const receiptSource = readFileSync(
  "src/workspaces/storefront/checkout/receipt.ts",
  "utf8",
);

assert.match(checkoutForm, /name="notes"/);
assert.match(checkoutForm, /value=\{fields\.notes\}/);
assert.match(checkoutForm, /patchFields\(\{ notes: event\.target\.value \}\)/);
assert.match(checkoutAction, /const notes = String\(formData\.get\("notes"\) \?\? ""\)\.trim\(\)/);
assert.match(checkoutAction, /p_notes: notes \|\| null/);
assert.match(submitMigration, /customer_notes[\s\S]{0,500}nullif\(trim\(coalesce\(p_notes, ''\)\), ''\)/);

assert.match(ownerQueries, /customer_notes/);
assert.match(ownerQueries, /internal_notes/);
assert.match(ownerQueries, /notes: row\.customer_notes/);
assert.match(ownerQueries, /internalNotes: row\.internal_notes/);
assert.match(ownerDetail, /<ViewBlock title="Order Notes">/);
assert.match(ownerDetail, /order\.notes\?\.trim\(\) \? order\.notes : "No order notes\."/);
assert.match(ownerDetail, /whitespace-pre-wrap/);
assert.match(ownerDetail, /<ViewBlock title="Internal notes">/);
assert.match(ownerDetail, /order\.internalNotes/);

assert.match(COLLECTION_ORDER_SELECT, /customer_notes/);
const multilineNote = "Please call on arrival.\nLeave by side door; thank you!";
const mapped = mapCollectionBoardOrder({
  id: "order-with-notes",
  order_number: "ORD-NOTES",
  guest_name: "Guest",
  guest_phone: "0123456789",
  customer_id: null,
  pickup_date: "2026-10-03",
  pickup_time: "13:00:00",
  fulfilment_method: "pickup",
  status: "submitted",
  customer_notes: multilineNote,
  production_started_at: null,
  ready_at: null,
  picked_up_at: null,
  out_for_delivery_at: null,
  delivered_at: null,
  include_receipt: false,
});
assert.equal(mapped.customerNotes, multilineNote, "newlines and punctuation survive mapping");
assert.match(collectionDetail, /order\.customerNotes\.trim\(\)/);
assert.match(collectionDetail, /whitespace-pre-wrap/);
assert.match(collectionCard, /Order note:/);
assert.equal(
  mapCollectionBoardOrder({
    id: "order-empty-notes",
    order_number: "ORD-NO-NOTES",
    guest_name: "Guest",
    guest_phone: null,
    customer_id: null,
    pickup_date: "2026-10-03",
    pickup_time: "13:00:00",
    fulfilment_method: "pickup",
    status: "submitted",
    customer_notes: null,
    production_started_at: null,
    ready_at: null,
    picked_up_at: null,
    out_for_delivery_at: null,
    delivered_at: null,
    include_receipt: false,
  }).customerNotes,
  null,
  "orders without notes remain valid",
);

assert.equal(
  OPTIONAL_NOTES_CUSTOMER_WARNING,
  "Please note: wording on cakes or cake boards and customised cake decoration are not available.",
);
assert.match(checkoutForm, /\{OPTIONAL_NOTES_CUSTOMER_WARNING\}/);
assert.match(receiptSource, /customer_notes/);
assert.doesNotMatch(receiptSource, /internal_notes/);

console.log("PASS Customer Order Notes");
