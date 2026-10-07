import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import { buildWhatsAppDeepLink } from "@/engines/orders/whatsapp";
import {
  closeCapabilitiesOnDate,
  copyWeeklyDayToDate,
} from "@/engines/business-calendar/operating-hours";
import {
  generateCustomerDeliveryReadyMessage,
  generateCustomerReadyMessage,
  generateCustomerThankYouMessage,
} from "@/engines/orders/messages";
import { WHITEBIRD_CUSTOMER_PHONE } from "@/engines/orders/whitebird-customer-contact";
import { STOREFRONT_WHATSAPP_PHONE } from "@/workspaces/storefront/home/storefront-contact";
import { mapCollectionBoardOrder } from "@/workspaces/collection/map-order";
import {
  COLLECTION_READY_MESSAGE_SENT_EVENT,
  collectionReadyMessageSentFromEvent,
  collectionReadyMessageVariant,
  generateCollectionReadyMessage,
  resolveCollectionReadyMessageOperatingHours,
  selectCollectionWhatsAppMessage,
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
assert.equal(
  generateCollectionReadyMessage(pickup, "Lily"),
  generateCustomerReadyMessage("Lily"),
  "open pickup keeps the exact existing Ready Message",
);
const thankYouMessage = generateCustomerThankYouMessage();
assert.equal(
  thankYouMessage,
  "Thank you for the order and hope you enjoy ya ;)\n\n" +
    "If there’s anything please do not hesitate to let us know so we can improve and serve you better !\n\n" +
    "Thank you once again and have a nice day ahead!",
  "Collection uses the exact approved Production Thank You content",
);

const WEDNESDAY = "2026-10-07";
const MONDAY = "2026-10-05";
const pickupFor = (pickupDate: string) => ({ ...pickup, pickupDate });
const readyMessageHoursFor = (
  pickupDate: string,
  snapshot: typeof OPERATING_HOURS_SEED,
) => resolveCollectionReadyMessageOperatingHours(pickupDate, snapshot);

const weeklyWednesdayHours = readyMessageHoursFor(
  WEDNESDAY,
  OPERATING_HOURS_SEED,
);
assert.deepEqual(weeklyWednesdayHours, {
  whitebirdStatus: "closed",
  pickupLatestBookable: "15:00",
});
const closedWednesdayMessage = generateCollectionReadyMessage(
  {
    ...pickupFor(WEDNESDAY),
    readyMessageOperatingHours: weeklyWednesdayHours,
  },
  "wee",
);
assert.equal(
  closedWednesdayMessage,
  "Good morning, wee here ☀️\n" +
    "Just to let you know that your order above is ready for pickup ya from now until latest 3pm ya.\n\n" +
    "Do give us a CALL at 0128730060 when you arrive as we are closed today so we will open the door for you ya.\n" +
    "(we might miss the message so please call, thank you)",
);

const openedWednesday = copyWeeklyDayToDate(
  OPERATING_HOURS_SEED,
  WEDNESDAY,
  1,
  ["whitebird"],
);
const openedWednesdayMessage = generateCollectionReadyMessage(
  {
    ...pickupFor(WEDNESDAY),
    readyMessageOperatingHours: readyMessageHoursFor(
      WEDNESDAY,
      openedWednesday,
    ),
  },
  "Lily",
);
assert.equal(openedWednesdayMessage, generateCustomerReadyMessage("Lily"));

const closedMonday = closeCapabilitiesOnDate(OPERATING_HOURS_SEED, MONDAY, [
  "whitebird",
]);
const closedMondayHours = readyMessageHoursFor(MONDAY, closedMonday);
assert.equal(closedMondayHours.whitebirdStatus, "closed");
assert.equal(closedMondayHours.pickupLatestBookable, "17:30");
assert.match(
  generateCollectionReadyMessage(
    { ...pickupFor(MONDAY), readyMessageOperatingHours: closedMondayHours },
    "Lily",
  ),
  /latest 5:30pm/,
);

const closedWednesdayAtFour = {
  ...OPERATING_HOURS_SEED,
  overrides: [
    ...OPERATING_HOURS_SEED.overrides,
    {
      ...OPERATING_HOURS_SEED.weekly.find(
        (row) => row.capability === "pickup" && row.weekday === 3,
      )!,
      overrideDate: WEDNESDAY,
      latestBookable: "16:00",
      closesAt: "16:00",
      note: null,
    },
  ],
};
assert.match(
  generateCollectionReadyMessage(
    {
      ...pickupFor(WEDNESDAY),
      readyMessageOperatingHours: readyMessageHoursFor(
        WEDNESDAY,
        closedWednesdayAtFour,
      ),
    },
    "Lily",
  ),
  /latest 4pm/,
);

const missingLatestPickupTime = {
  ...OPERATING_HOURS_SEED,
  overrides: [
    ...OPERATING_HOURS_SEED.overrides,
    {
      ...OPERATING_HOURS_SEED.weekly.find(
        (row) => row.capability === "pickup" && row.weekday === 3,
      )!,
      overrideDate: WEDNESDAY,
      latestBookable: null,
      note: null,
    },
  ],
};
const noDeadlineMessage = generateCollectionReadyMessage(
  {
    ...pickupFor(WEDNESDAY),
    readyMessageOperatingHours: readyMessageHoursFor(
      WEDNESDAY,
      missingLatestPickupTime,
    ),
  },
  "Lily",
);
assert.match(noDeadlineMessage, /ready for pickup ya\.\n\nDo give us a CALL/);
assert.doesNotMatch(noDeadlineMessage, /latest \d/);
const malformedLatestPickupTime = {
  ...missingLatestPickupTime,
  overrides: missingLatestPickupTime.overrides.map((row) =>
    row.capability === "pickup"
      ? { ...row, latestBookable: "25:00" }
      : row,
  ),
};
const malformedDeadlineMessage = generateCollectionReadyMessage(
  {
    ...pickupFor(WEDNESDAY),
    readyMessageOperatingHours: readyMessageHoursFor(
      WEDNESDAY,
      malformedLatestPickupTime,
    ),
  },
  "Lily",
);
assert.doesNotMatch(malformedDeadlineMessage, /latest \d/);

const unknownHours = readyMessageHoursFor(MONDAY, {
  weekly: [],
  overrides: [],
});
assert.equal(unknownHours.whitebirdStatus, "unknown");
assert.equal(
  generateCollectionReadyMessage(
    { ...pickupFor(MONDAY), readyMessageOperatingHours: unknownHours },
    "Lily",
  ),
  generateCustomerReadyMessage("Lily"),
);
const malformedHours = {
  ...OPERATING_HOURS_SEED,
  weekly: OPERATING_HOURS_SEED.weekly.map((row) =>
    row.capability === "whitebird" && row.weekday === 1
      ? { ...row, opensAt: null, closesAt: null, latestBookable: null }
      : row,
  ),
};
assert.equal(
  readyMessageHoursFor(MONDAY, malformedHours).whitebirdStatus,
  "unknown",
);

assert.equal(WHITEBIRD_CUSTOMER_PHONE, "+60128730060");
assert.equal(STOREFRONT_WHATSAPP_PHONE, WHITEBIRD_CUSTOMER_PHONE);
assert.match(closedWednesdayMessage, /CALL at 0128730060/);

const dineInWhileClosed = {
  ...pickupFor(WEDNESDAY),
  fulfilmentMethod: "dine_in" as const,
  readyMessageOperatingHours: weeklyWednesdayHours,
};
assert.equal(
  generateCollectionReadyMessage(dineInWhileClosed, "Lily"),
  generateCustomerReadyMessage("Lily"),
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
assert.equal(
  generateCollectionReadyMessage(delivery, "Lily"),
  generateCustomerDeliveryReadyMessage({
    senderName: "Lily",
    scheduledTime: delivery.pickupTime,
    variant: collectionReadyMessageVariant(delivery),
  }),
  "delivery Ready Message remains unchanged",
);

const sent = collectionReadyMessageSentFromEvent(
  { createdAt: "2026-10-06T04:05:00.000Z", actorStaffId: "staff-1" },
  "Lily",
);
assert.deepEqual(sent, {
  sentAt: "2026-10-06T04:05:00.000Z",
  sentByName: "Lily",
});
const readySelection = selectCollectionWhatsAppMessage(
  generateCollectionReadyMessage(pickup, "Lily"),
  thankYouMessage,
  Boolean(null),
);
assert.deepEqual(readySelection, {
  kind: "ready",
  text: generateCustomerReadyMessage("Lily"),
});
const thankYouSelection = selectCollectionWhatsAppMessage(
  generateCollectionReadyMessage(pickup, "Lily"),
  thankYouMessage,
  Boolean(sent),
);
assert.deepEqual(thankYouSelection, {
  kind: "thank_you",
  text: thankYouMessage,
});
assert.equal(
  new URL(
    buildWhatsAppDeepLink(pickup.guestPhone ?? "", thankYouSelection.text)!,
  ).searchParams.get("text"),
  thankYouMessage,
  "after persisted Ready Message Sent, WhatsApp uses the existing Thank You text",
);
assert.equal(buildWhatsAppDeepLink("", thankYouSelection.text), null);
assert.equal(
  buildWhatsAppDeepLink("not a phone", thankYouSelection.text),
  null,
);
assert.equal(collectionReadyMessageSentFromEvent(null, null), null);
assert.equal(COLLECTION_READY_MESSAGE_SENT_EVENT, "customer_ready_message_sent");

const detailSource = readSrc("src/workspaces/collection/CollectionOrderDetail.tsx");
assert.match(detailSource, /<CollectionReadyMessage/);

const componentSource = readSrc("src/workspaces/collection/CollectionReadyMessage.tsx");
assert.match(componentSource, /Customer Ready Message/);
assert.match(componentSource, /Customer Thank You Message/);
assert.ok(
  componentSource.indexOf("Customer Ready Message") <
    componentSource.indexOf("Customer Thank You Message"),
  "Thank You action appears below the Ready Message action",
);
assert.match(componentSource, /Mark Ready Message Sent/);
assert.equal(componentSource.match(/Open WhatsApp —/g)?.length, 1);
assert.match(componentSource, /Copy for WhatsApp\. Nothing is sent automatically\./);
assert.match(
  componentSource,
  /buildWhatsAppDeepLink\([\s\S]*order\.guestPhone \?\? ""[\s\S]*selectedWhatsAppMessage\.text/,
);
assert.match(componentSource, /generateCustomerThankYouMessage\(\)/);
assert.match(componentSource, /Boolean\(sent\)/);
assert.match(
  componentSource,
  /generatedText=\{previewKind === "ready" \? message : thankYouMessage\}/,
);
assert.match(
  componentSource,
  /type=\{previewKind === "ready" \? messageType : "customer_thank_you"\}/,
);
assert.match(
  componentSource,
  /onSenderNameChange=\{\s*previewKind === "ready" \? setSenderName : undefined/,
);
const thankYouPreviewHandler = componentSource.slice(
  componentSource.indexOf('onClick={() => setPreviewKind("thank_you")}'),
  componentSource.indexOf(
    'type="button"',
    componentSource.indexOf('onClick={() => setPreviewKind("thank_you")}'),
  ),
);
assert.doesNotMatch(
  thankYouPreviewHandler,
  /markCollectionReadyMessageSentAction|customer_ready_message_sent/,
  "opening the Thank You preview does not change Ready Message Sent state",
);
const openWhatsAppHandler = componentSource.slice(
  componentSource.indexOf("function openWhatsApp()"),
  componentSource.indexOf(
    "\n  return (",
    componentSource.indexOf("function openWhatsApp()"),
  ),
);
assert.match(openWhatsAppHandler, /window\.open\(whatsappUrl/);
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
assert.match(querySource, /loadOperatingHoursSnapshot/);
assert.match(querySource, /resolveCollectionReadyMessageOperatingHours\(order\.pickupDate/);
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
