import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapCollectionBoardOrder } from "@/workspaces/collection/map-order";
import {
  COLLECTION_READY_MESSAGE_SENT_EVENT,
  collectionReadyMessageSentFromEvent,
  collectionReadyMessageVariant,
  generateCollectionReadyMessage,
} from "@/workspaces/collection/ready-message";

function readSrc(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const pickup = mapCollectionBoardOrder({
  id: "order-pickup",
  order_number: "ORD-PICKUP",
  guest_name: "A Customer",
  guest_phone: "0123456789",
  customer_id: null,
  pickup_date: "2026-10-06",
  pickup_time: "14:00:00",
  fulfilment_method: "pickup",
  status: "paid",
  customer_notes: null,
  production_started_at: null,
  ready_at: "2026-10-06T04:00:00.000Z",
  picked_up_at: null,
  out_for_delivery_at: null,
  delivered_at: null,
  include_receipt: false,
});
assert.match(generateCollectionReadyMessage(pickup, "Lily"), /Good morning, Lily here/);
assert.match(
  generateCollectionReadyMessage(pickup, "Lily"),
  /ready for pick up/,
);

const delivery = mapCollectionBoardOrder({
  id: "order-delivery",
  order_number: "ORD-DELIVERY",
  guest_name: "Customer Name",
  guest_phone: "0123456789",
  customer_id: null,
  pickup_date: "2026-10-06",
  pickup_time: "14:00:00",
  fulfilment_method: "delivery",
  status: "paid",
  customer_notes: null,
  production_started_at: null,
  ready_at: "2026-10-06T04:00:00.000Z",
  picked_up_at: null,
  out_for_delivery_at: null,
  delivered_at: null,
  include_receipt: false,
  order_delivery_details: {
    recipient_name: "Different Recipient",
    recipient_phone: "0198765432",
    address_line_1: "1 Jalan Example",
    address_line_2: null,
    postcode: "88000",
    city: "Kota Kinabalu",
    state: "Sabah",
    recipient_notify_preference: "inform_recipient",
  },
});
assert.equal(collectionReadyMessageVariant(delivery), "contact_recipient");
assert.match(
  generateCollectionReadyMessage(delivery, "Lily"),
  /We will contact the recipient/,
);

const sent = collectionReadyMessageSentFromEvent(
  { createdAt: "2026-10-06T04:05:00.000Z", actorStaffId: "staff-1" },
  "Lily",
);
assert.deepEqual(sent, {
  sentAt: "2026-10-06T04:05:00.000Z",
  sentByName: "Lily",
});
assert.equal(collectionReadyMessageSentFromEvent(null, null), null);
assert.equal(COLLECTION_READY_MESSAGE_SENT_EVENT, "customer_ready_message_sent");

const detailSource = readSrc("src/workspaces/collection/CollectionOrderDetail.tsx");
assert.match(detailSource, /<CollectionReadyMessage/);

const componentSource = readSrc("src/workspaces/collection/CollectionReadyMessage.tsx");
assert.match(componentSource, /Customer Ready Message/);
assert.match(componentSource, /Mark Ready Message Sent/);
assert.match(componentSource, /Copy for WhatsApp\. Nothing is sent automatically\./);
const markHandler = componentSource.slice(
  componentSource.indexOf("function markSent"),
  componentSource.indexOf("\n  return (", componentSource.indexOf("function markSent")),
);
assert.match(markHandler, /markCollectionReadyMessageSentAction\(order\.id\)/);
assert.equal(
  componentSource.match(/markCollectionReadyMessageSentAction/g)?.length,
  2,
  "the action is imported and invoked only from the explicit mark-sent handler",
);

const actionSource = readSrc("src/workspaces/collection/actions.ts");
assert.match(actionSource, /COLLECTION_READY_MESSAGE_SENT_EVENT/);
assert.match(actionSource, /actor_staff_id:\s*staff\.id/);
assert.match(actionSource, /sentAt:\s*String\(inserted\.created_at\)/);
assert.match(actionSource, /order_timeline_events/);
assert.match(actionSource, /if \(existing\)/, "repeat confirmation reuses the saved event");
assert.match(actionSource, /Only an active, ready Collection order can be marked sent/);

const querySource = readSrc("src/workspaces/collection/queries.ts");
assert.match(querySource, /order_timeline_events/);
assert.match(querySource, /actor_staff_id/);
assert.match(querySource, /staff_profiles/);
assert.match(querySource, /collectionReadyMessageSentFromEvent/);
assert.match(
  componentSource,
  /✓ Ready Message Sent[\s\S]*Sent by \$\{sent\.sentByName[\s\S]*formatTimelineDateTime\(sent\.sentAt\)/,
  "reopened details display persistent actor and time",
);

const previewSource = readSrc("src/workspaces/owner/orders/OrderMessagePreview.tsx");
assert.match(previewSource, /nothing is sent\s+automatically/);
assert.match(previewSource, /navigator\.clipboard\.writeText/);

console.log("PASS Collection Ready Message display, copy and sent-state contract");
