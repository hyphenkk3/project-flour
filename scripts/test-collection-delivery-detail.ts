/** Collection Delivery details + lifecycle wiring (no DB). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recipientNotifyPreferenceLabel } from "@/engines/orders/fulfilment";
import { mapCollectionBoardOrder } from "@/workspaces/collection/map-order";
import { COLLECTION_ORDER_SELECT } from "@/workspaces/collection/select";
import { buildCollectionWorkspaceCapabilities } from "@/engines/collection/capabilities";

for (const role of ["owner", "manager", "customer_operations"] as const) {
  assert.equal(
    buildCollectionWorkspaceCapabilities({ role, staffId: role })
      .canManageDelivery,
    true,
  );
}
assert.equal(
  buildCollectionWorkspaceCapabilities({
    role: "collection",
    staffId: "collection",
  }).canManageDelivery,
  false,
);

const deliveryFields = [
  "recipient_name",
  "recipient_phone",
  "address_line_1",
  "address_line_2",
  "postcode",
  "city",
  "state",
  "recipient_notify_preference",
];
for (const field of deliveryFields) {
  assert.match(COLLECTION_ORDER_SELECT, new RegExp(`\\b${field}\\b`));
}
assert.match(COLLECTION_ORDER_SELECT, /order_delivery_details\s*\(/);

const order = mapCollectionBoardOrder({
  id: "order-1",
  order_number: "ORD-1",
  guest_name: "Delivery Guest",
  guest_phone: "0123456789",
  customer_id: null,
  pickup_date: "2026-10-03",
  pickup_time: "13:00:00",
  fulfilment_method: "delivery",
  status: "paid",
  customer_notes: null,
  production_started_at: null,
  ready_at: "2026-10-03T04:00:00Z",
  picked_up_at: null,
  out_for_delivery_at: null,
  delivered_at: null,
  include_receipt: false,
  order_delivery_details: {
    recipient_name: "Recipient Example",
    recipient_phone: "0198765432",
    address_line_1: "12 Jalan Example",
    address_line_2: "Taman Example",
    postcode: "88000",
    city: "Kota Kinabalu",
    state: "Sabah",
    recipient_notify_preference: "inform_recipient",
  },
});

assert.deepEqual(order.delivery, {
  recipientName: "Recipient Example",
  recipientPhone: "0198765432",
  addressLines: [
    "12 Jalan Example",
    "Taman Example",
    "88000 Kota Kinabalu",
    "Sabah",
  ],
  recipientNotifyPreference: "inform_recipient",
});
assert.equal(
  recipientNotifyPreferenceLabel(order.delivery?.recipientNotifyPreference),
  "Inform Recipient",
);

const pickup = mapCollectionBoardOrder({
  id: "order-2",
  order_number: "ORD-2",
  guest_name: "Pickup Guest",
  guest_phone: null,
  customer_id: null,
  pickup_date: "2026-10-03",
  pickup_time: "13:00:00",
  fulfilment_method: "pickup",
  status: "paid",
  customer_notes: null,
  production_started_at: null,
  ready_at: "2026-10-03T04:00:00Z",
  picked_up_at: null,
  out_for_delivery_at: null,
  delivered_at: null,
  include_receipt: false,
});
assert.equal(pickup.delivery, null, "Pickup remains without Delivery DTO");

const deliveryActionsSource = readFileSync(
  "src/workspaces/collection/CollectionDeliveryActions.tsx",
  "utf8",
);
for (const action of [
  "markOrderOutForDeliveryAction",
  "undoOrderOutForDeliveryAction",
  "markOrderDeliveredAction",
  "undoOrderDeliveredAction",
]) {
  assert.ok(
    deliveryActionsSource.includes(action),
    `Collection uses existing ${action}`,
  );
}
assert.doesNotMatch(deliveryActionsSource, /\.rpc\(/);

const detailSource = readFileSync(
  "src/workspaces/collection/CollectionOrderDetail.tsx",
  "utf8",
);
assert.match(detailSource, /isDelivery\s*\?\s*\(/);
assert.match(detailSource, /<CollectionDeliveryActions/);
assert.match(detailSource, /<CollectionHandoffActions/);

console.log("PASS Collection Delivery detail data and action wiring");
