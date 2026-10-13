import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipientWhatsAppButton } from "../src/components/orders/RecipientWhatsAppButton";
import {
  recipientWhatsAppLink,
  type RecipientWhatsAppInput,
} from "../src/engines/orders/recipient-whatsapp";

const delivery: RecipientWhatsAppInput = {
  fulfilmentMethod: "delivery",
  recipientNotifyPreference: "inform_recipient",
  recipientPhone: "6596230653",
  addressLine1: "12 Test Road",
  addressLines: ["12 Test Road", "Singapore"],
  scheduledTime: "14:30:00",
  staffDisplayName: "Jasmine",
};

const valid = recipientWhatsAppLink(delivery);
assert.equal(valid.visible, true);
assert.equal(valid.reason, null);
assert.ok(valid.url?.startsWith("https://wa.me/6596230653?text="));
assert.ok(!valid.url?.includes("606596230653"));
const message = new URL(valid.url!).searchParams.get("text");
assert.equal(
  message,
  "Morning, this is Jasmine from Whitebird.\n\n" +
    "We have a scheduled delivery for you from your family/friend and it is supposed to " +
    "be delivered to *12 Test Road, Singapore at 2:30 PM.*\n\n" +
    "The order is actually ready for delivery at the moment. May we know when would be " +
    "a good time for us to arrange the delivery ya?\n\n" +
    "Hope to hear from you soon.\nThank you ☺️",
);
assert.match(
  renderToStaticMarkup(<RecipientWhatsAppButton {...delivery} />),
  /WhatsApp Recipient/,
);

for (const value of ["+6596230653", "60123456789", "+60123456789"]) {
  const result = recipientWhatsAppLink({ ...delivery, recipientPhone: value });
  assert.ok(
    result.url?.startsWith(`https://wa.me/${value.replace(/\D/g, "")}?`),
  );
}
for (const fulfilmentMethod of [
  "pickup",
  "dine_in",
  "drive_through",
] as const) {
  assert.deepEqual(recipientWhatsAppLink({ ...delivery, fulfilmentMethod }), {
    visible: false,
    url: null,
    reason: null,
  });
}
assert.equal(
  recipientWhatsAppLink({
    ...delivery,
    recipientNotifyPreference: "do_not_inform_recipient",
  }).visible,
  false,
);
// Eligibility depends only on the stored delivery choice, never readyAt.
assert.equal(recipientWhatsAppLink(delivery).visible, true);
for (const [patch, expected] of [
  [{ recipientPhone: "" }, "Recipient phone number is missing."],
  [
    { recipientPhone: "not-a-phone" },
    "Recipient phone number is invalid for WhatsApp.",
  ],
  [{ addressLine1: "", addressLines: [] }, "Delivery address is missing."],
  [{ scheduledTime: "" }, "Scheduled delivery time is missing."],
  [{ staffDisplayName: "" }, "Staff display name is missing."],
] as const) {
  const result = recipientWhatsAppLink({ ...delivery, ...patch });
  assert.equal(result.url, null);
  assert.equal(result.reason, expected);
  const html = renderToStaticMarkup(
    <RecipientWhatsAppButton {...delivery} {...patch} />,
  );
  assert.match(html, /disabled=""/);
  assert.ok(html.includes(expected));
}

const owner = readFileSync(
  "src/workspaces/owner/orders/OrderMessagesSection.tsx",
  "utf8",
);
const collection = readFileSync(
  "src/workspaces/collection/CollectionOrderDetail.tsx",
  "utf8",
);
const collectionMessages = readFileSync(
  "src/workspaces/collection/CollectionReadyMessage.tsx",
  "utf8",
);
assert.match(
  owner,
  /<RecipientWhatsAppButton[\s\S]*?recipientPhone=\{order\.delivery\.recipientPhone\}/,
);
assert.match(
  collectionMessages,
  /<RecipientWhatsAppButton[\s\S]*?recipientPhone=\{order\.delivery\.recipientPhone\}/,
);
assert.ok(
  owner.indexOf("<RecipientWhatsAppButton") > owner.indexOf("customerActions.map"),
);
assert.ok(owner.indexOf("<RecipientWhatsAppButton") < owner.indexOf("</section>"));
assert.ok(!collection.includes("<RecipientWhatsAppButton"));
assert.ok(collection.includes("<CollectionReadyMessage"));
assert.ok(
  collectionMessages.indexOf("<RecipientWhatsAppButton") >
    collectionMessages.indexOf('aria-label="Order messages"'),
);
assert.ok(
  collectionMessages.indexOf("<RecipientWhatsAppButton") <
    collectionMessages.indexOf("</section>"),
);
assert.match(collectionMessages, /if \(!showCustomer && !showRecipient\) return null/);
assert.match(collectionMessages, /RECIPIENT/);
assert.match(owner, /Recipient/);
console.log(
  "PASS recipient WhatsApp behavior and grouped messaging layout in both locations",
);
