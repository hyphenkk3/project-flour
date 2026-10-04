/** Customer Order Notes flow from checkout to Bakery and staff order details. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OPTIONAL_NOTES_CUSTOMER_WARNING } from "@/engines/orders/order-guide";
import { hasCustomerOrderNote } from "@/components/orders/CustomerOrderNoteCallout";
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
const noteCallout = readFileSync(
  "src/components/orders/CustomerOrderNoteCallout.tsx",
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
assert.equal(
  hasCustomerOrderNote("Please call on arrival.\nLeave by side door; thank you!"),
  true,
);
assert.equal(hasCustomerOrderNote(" \n  "), false);
assert.equal(hasCustomerOrderNote(null), false);
assert.match(noteCallout, /CUSTOMER ORDER NOTE/);
assert.match(noteCallout, /if \(!hasCustomerOrderNote\(note\)\) return null/);
assert.match(noteCallout, /whitespace-pre-wrap/);
assert.match(noteCallout, /\{note\}/);
assert.equal(
  (ownerDetail.match(/<CustomerOrderNoteCallout note=\{order\.notes\} \/>/g) ?? []).length,
  2,
  "the note callout appears once in each mutually exclusive Order Workspace mode",
);
const ownerViewStart = ownerDetail.indexOf('if (mode === "view")');
const ownerViewNote = ownerDetail.indexOf(
  "<CustomerOrderNoteCallout note={order.notes} />",
  ownerViewStart,
);
assert.ok(
  ownerViewNote > ownerViewStart &&
    ownerViewNote < ownerDetail.indexOf("<OrderLifecycleActions", ownerViewNote),
  "Order Workspace detail shows the callout near the top",
);
const ownerEditStart = ownerDetail.indexOf("<form action={formAction}");
const ownerEditNote = ownerDetail.indexOf(
  "<CustomerOrderNoteCallout note={order.notes} />",
  ownerEditStart,
);
assert.ok(
  ownerEditNote > ownerEditStart &&
    ownerEditNote < ownerDetail.indexOf("{renderApprovalPanels()}", ownerEditStart),
  "Edit Order shows the same read-only callout near the top",
);
assert.doesNotMatch(ownerDetail, /<ViewBlock title="Order Notes">/);
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
assert.match(collectionDetail, /<CustomerOrderNoteCallout note=\{order\.customerNotes\} \/>/);
const collectionNotePosition = collectionDetail.indexOf(
  "<CustomerOrderNoteCallout note={order.customerNotes} />",
);
assert.ok(
  collectionNotePosition > collectionDetail.indexOf("</header>") &&
    collectionNotePosition <
      collectionDetail.indexOf('{!secured && order.status === "awaiting_payment"'),
  "Customer Operations detail shows the note immediately below the order header",
);
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
