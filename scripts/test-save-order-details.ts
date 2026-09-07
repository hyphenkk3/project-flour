/**
 * Replace customer submission-copy email with Save Order Details.
 * Run: npx tsx scripts/test-save-order-details.ts
 *
 * Does not send email, submit orders, or touch staff notification dispatch.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GuestPreorderReceipt } from "@/workspaces/storefront/checkout/receipt";
import {
  buildOrderDetailsCardModel,
  canShareOrderDetailsFile,
  isShareAbortError,
  orderDetailsFileName,
  shareOrDownloadOrderDetailsImage,
  wrapCanvasText,
} from "@/workspaces/storefront/checkout/order-details-card";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function sampleReceipt(
  overrides: Partial<GuestPreorderReceipt> = {},
): GuestPreorderReceipt {
  return {
    orderNumber: "WB-1001",
    guestName: "YC Wee",
    guestPhone: "0128730060",
    notes: "Write Happy Birthday on the card.",
    items: [
      {
        key: "1",
        cakeName: "Japanese Strawberry",
        sizeLabel: '6"',
        quantity: 1,
        unitPrice: 78,
      },
      {
        key: "2",
        cakeName: "Pistachio Raspberry Kiss",
        sizeLabel: '6"',
        quantity: 2,
        unitPrice: 135,
      },
    ],
    paidAddons: [
      {
        key: "a1",
        name: "Birthday Card",
        quantity: 1,
        unitPrice: 3,
      },
    ],
    pickupDate: "2026-09-12",
    pickupTime: "14:00",
    fulfilmentMethod: "pickup",
    guestCount: null,
    dineInVenue: null,
    reservationTime: null,
    total: 351,
    isFreshPick: false,
    ...overrides,
  };
}

const model = buildOrderDetailsCardModel(sampleReceipt());
assert.equal(model.brand, "WHITEBIRD");
assert.equal(model.title, "Order Received");
assert.equal(model.footer, "Please keep this for your reference.");
assert.equal(
  model.rows.find((row) => row.label === "Order number")?.value,
  "WB-1001",
);
assert.equal(
  model.rows.find((row) => row.label === "Customer name")?.value,
  "YC Wee",
);
assert.equal(
  model.rows.find((row) => row.label === "WhatsApp number")?.value,
  "0128730060",
);
assert.equal(
  model.rows.find((row) => row.label === "Collection date")?.value,
  "12/09/2026",
);
assert.equal(
  model.rows.find((row) => row.label === "Collection time")?.value,
  "2:00 PM",
);
assert.equal(
  model.rows.find((row) => row.label === "Fulfilment method")?.value,
  "Pickup",
);
assert.equal(model.cakes[0]?.name, "Japanese Strawberry");
assert.match(model.cakes[0]?.meta ?? "", /6"/);
assert.equal(model.cakes[0]?.price, "RM78");
assert.equal(model.cakes[1]?.price, "RM270");
assert.equal(model.addons[0]?.name, "Birthday Card");
assert.equal(model.addons[0]?.price, "RM3");
assert.equal(model.total, "RM351");
assert.equal(model.notes, "Write Happy Birthday on the card.");
assert.equal(
  model.rows.some((row) => /email/i.test(row.label)),
  false,
);

const dineIn = buildOrderDetailsCardModel(
  sampleReceipt({
    fulfilmentMethod: "dine_in",
    dineInVenue: "hyphen",
    guestCount: 2,
    reservationTime: "13:00",
    notes: null,
    paidAddons: [],
  }),
);
assert.match(
  dineIn.rows.find((row) => row.label === "Fulfilment method")?.value ?? "",
  /Dine-in/,
);
assert.equal(dineIn.rows.find((row) => row.label === "Venue")?.value, "Hyphen");
assert.equal(dineIn.notes, null);
assert.equal(dineIn.addons.length, 0);

assert.equal(orderDetailsFileName("WB-1001"), "whitebird-order-WB-1001.png");
assert.equal(orderDetailsFileName(null), "whitebird-order-details.png");
assert.equal(
  wrapCanvasText((text) => text.length, "one two three", 7).join("|"),
  "one two|three",
);

assert.equal(
  canShareOrderDetailsFile(new File(["x"], "a.png", { type: "image/png" }), {}),
  false,
);
assert.equal(
  canShareOrderDetailsFile(new File(["x"], "a.png", { type: "image/png" }), {
    share: async () => undefined,
    canShare: () => true,
  }),
  true,
);
assert.equal(isShareAbortError({ name: "AbortError" }), true);
assert.equal(isShareAbortError(new Error("fail")), false);

assert.equal(
  existsSync(
    resolve(
      process.cwd(),
      "src/workspaces/storefront/checkout/guest-preorder-copy-email.ts",
    ),
  ),
  false,
);
assert.equal(
  existsSync(
    resolve(
      process.cwd(),
      "src/workspaces/storefront/checkout/guest-preorder-copy-email-content.ts",
    ),
  ),
  false,
);

const formSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.doesNotMatch(formSrc, /Email me a copy of my preorder submission/);
assert.doesNotMatch(formSrc, /name="email"/);
assert.doesNotMatch(formSrc, /name="email_submission_receipt_requested"/);
assert.doesNotMatch(formSrc, /For a copy of your preorder submission/);
assert.match(formSrc, /name="phone"/);
assert.match(formSrc, /name="include_receipt"/);
assert.match(
  formSrc,
  /window\.location\.assign\(`\/order\/success\?order=\$\{orderId\}`\)/,
);

const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
assert.match(actionsSrc, /scheduleStaffNotificationDispatch\(\)/);
assert.doesNotMatch(actionsSrc, /scheduleGuestPreorderCopyEmail/);
assert.doesNotMatch(actionsSrc, /guest-preorder-copy/);
assert.match(actionsSrc, /p_email: null/);
assert.match(actionsSrc, /p_email_submission_receipt_requested: false/);
assert.match(actionsSrc, /return \{ error: null, orderId \}/);
assert.doesNotMatch(
  actionsSrc,
  /redirect\(`\/order\/success\?order=\$\{orderId\}`\)/,
);
assert.doesNotMatch(actionsSrc, /Please enter your email to receive a copy/);

const staffDispatchSrc = readSrc(
  "src/foundation/staff/staff-notification-dispatch.ts",
);
assert.doesNotMatch(staffDispatchSrc, /scheduleGuestPreorderCopyEmail/);
assert.doesNotMatch(staffDispatchSrc, /guest-preorder-copy/);
assert.doesNotMatch(staffDispatchSrc, /Save Order Details/);
assert.match(staffDispatchSrc, /from: "Whitebird <onboarding@resend.dev>"/);

const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
assert.match(extraFormSrc, /Email me a copy of my order/);
assert.match(extraFormSrc, /name="email_submission_receipt_requested"/);

const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
assert.doesNotMatch(extraActionsSrc, /scheduleGuestPreorderCopyEmail/);

const successSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontSuccessPage.tsx",
);
assert.match(successSrc, /Order Received/);
assert.match(successSrc, /Payment Pending/);
assert.match(successSrc, /Whitebird will contact you via WhatsApp/);
assert.match(successSrc, /SaveOrderDetailsButton/);
assert.match(successSrc, /receipt && !isFreshPick/);
assert.doesNotMatch(successSrc, /Email me a copy/);

const buttonSrc = readSrc(
  "src/workspaces/storefront/checkout/SaveOrderDetailsButton.tsx",
);
assert.match(buttonSrc, /Save Order Details/);
assert.match(buttonSrc, /shareOrDownloadOrderDetailsImage/);
assert.match(buttonSrc, /renderOrderDetailsPng/);
assert.doesNotMatch(buttonSrc, /resend/i);
assert.doesNotMatch(buttonSrc, /mailto:/);

const receiptSrc = readSrc("src/workspaces/storefront/checkout/receipt.ts");
assert.match(receiptSrc, /guestPreorderReceiptAuthorized/);
assert.match(receiptSrc, /order_number/);
assert.match(receiptSrc, /guest_name/);
assert.match(receiptSrc, /guest_phone/);
assert.match(receiptSrc, /order_paid_addons/);
assert.match(receiptSrc, /calculateCommercialSubtotal/);
assert.doesNotMatch(
  receiptSrc,
  /from\("orders"\)[\s\S]*eq\("id", orderId\)[\s\S]*maybeSingle\(\)[\s\S]*return data/,
);

const cardSrc = readSrc(
  "src/workspaces/storefront/checkout/order-details-card.ts",
);
assert.match(cardSrc, /image\/png/);
assert.match(cardSrc, /navigator\.share|nav\.share/);
assert.match(cardSrc, /download/);
assert.doesNotMatch(cardSrc, /html2canvas/);
assert.doesNotMatch(cardSrc, /from "resend"/);

const downloads: string[] = [];

async function runShareTests() {
  const shared = await shareOrDownloadOrderDetailsImage({
    blob: new Blob(["png"], { type: "image/png" }),
    fileName: "whitebird-order-WB-1001.png",
    title: "Whitebird order details",
    nav: {
      canShare: () => true,
      share: async () => undefined,
    },
    download: () => {
      downloads.push("should-not-download");
    },
  });
  assert.equal(shared, "shared");
  assert.equal(downloads.length, 0);

  const downloaded = await shareOrDownloadOrderDetailsImage({
    blob: new Blob(["png"], { type: "image/png" }),
    fileName: "whitebird-order-WB-1001.png",
    title: "Whitebird order details",
    nav: {},
    download: (_blob, fileName) => {
      downloads.push(fileName);
    },
  });
  assert.equal(downloaded, "downloaded");
  assert.deepEqual(downloads, ["whitebird-order-WB-1001.png"]);

  const fallbackAfterShareFail = await shareOrDownloadOrderDetailsImage({
    blob: new Blob(["png"], { type: "image/png" }),
    fileName: "whitebird-order-WB-1001.png",
    title: "Whitebird order details",
    nav: {
      canShare: () => true,
      share: async () => {
        throw new Error("share failed");
      },
    },
    download: (_blob, fileName) => {
      downloads.push(fileName);
    },
  });
  assert.equal(fallbackAfterShareFail, "downloaded");
}

void runShareTests()
  .then(() => {
    console.log("PASS save order details");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
