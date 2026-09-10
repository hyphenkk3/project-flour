/**
 * Replace customer submission-copy email with Save Order Details.
 * Run: npx tsx scripts/test-save-order-details.ts
 *
 * Does not send email, submit orders, or touch staff notification dispatch.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatCustomerOrderPlacedAt } from "@/lib/dates";
import type { GuestPreorderReceipt } from "@/workspaces/storefront/checkout/receipt";
import {
  ORDER_DETAILS_CARD_CONTACT,
  ORDER_DETAILS_CARD_FOOTER,
  ORDER_DETAILS_CARD_PAYMENT,
  ORDER_DETAILS_PNG_HEIGHT,
  ORDER_DETAILS_PNG_WIDTH,
  buildOrderDetailsCardModel,
  canShareOrderDetailsFile,
  drawOrderDetailsCard,
  isIosTouchDevice,
  isShareAbortError,
  isShareNotAllowedError,
  isShareUnavailableError,
  orderDetailsFileName,
  resolveOrderDetailsSavePath,
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
    complimentaryItems: [
      {
        key: "c1",
        name: "Candle",
        quantity: 1,
      },
    ],
    pickupDate: "2026-09-12",
    pickupTime: "14:00",
    fulfilmentMethod: "pickup",
    guestCount: null,
    dineInVenue: null,
    reservationTime: null,
    total: 351,
    placedAt: "2026-09-09T00:38:00.000Z",
    isFreshPick: false,
    ...overrides,
  };
}

assert.equal(ORDER_DETAILS_PNG_WIDTH, 1080);
assert.equal(ORDER_DETAILS_PNG_HEIGHT, 1800);
assert.equal(
  formatCustomerOrderPlacedAt("2026-09-09T00:38:00.000Z"),
  "9 September 2026 · 8:38 AM",
);

const model = buildOrderDetailsCardModel(sampleReceipt());
assert.equal(model.brand, "WHITEBIRD");
assert.equal(model.title, "ORDER RECEIVED");
assert.equal(model.paymentStatus, ORDER_DETAILS_CARD_PAYMENT);
assert.equal(model.contactLine, ORDER_DETAILS_CARD_CONTACT);
assert.equal(model.footer, ORDER_DETAILS_CARD_FOOTER);
assert.equal(model.orderNumber, "WB-1001");
assert.equal(model.placedAt, "9 September 2026 · 8:38 AM");
assert.equal(model.customer, "YC Wee");
assert.equal(model.whatsapp, "0128730060");
assert.match(model.collectionWhen, /12 September 2026/);
assert.match(model.collectionWhen, /2:00 PM/);
assert.equal(model.fulfilment, "Pickup");
assert.equal(model.cakes[0]?.name, "Japanese Strawberry");
assert.equal(model.cakes[0]?.meta, '6" × 1');
assert.equal(model.cakes[0]?.price, "RM78");
assert.equal(model.cakes[1]?.price, "RM270");
assert.equal(model.addons[0]?.name, "Birthday Card");
assert.equal(model.addons[0]?.meta, "× 1");
assert.equal(model.addons[0]?.price, "RM3");
assert.equal(model.complimentary[0]?.name, "Candle");
assert.match(model.complimentary[0]?.meta ?? "", /Complimentary/);
assert.equal(model.complimentary[0]?.price, null);
assert.equal(model.total, "RM351");
assert.equal(model.notes, "Write Happy Birthday on the card.");
assert.doesNotMatch(model.customer, /email/i);

const freshPickModel = buildOrderDetailsCardModel(
  sampleReceipt({
    isFreshPick: true,
    items: [
      {
        key: "fp1",
        cakeName: "Avocado",
        sizeLabel: '6"',
        quantity: 1,
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
    complimentaryItems: [
      {
        key: "c1",
        name: "Candle",
        quantity: 1,
      },
    ],
    total: 138,
  }),
);
assert.equal(freshPickModel.brand, "WHITEBIRD");
assert.equal(freshPickModel.title, "ORDER RECEIVED");
assert.equal(freshPickModel.placedAt, "9 September 2026 · 8:38 AM");
assert.equal(freshPickModel.cakes[0]?.name, "Avocado");
assert.equal(freshPickModel.cakes[0]?.meta, '6" × 1');
assert.equal(freshPickModel.cakes[0]?.price, "RM135");
assert.equal(freshPickModel.addons[0]?.name, "Birthday Card");
assert.equal(freshPickModel.complimentary[0]?.name, "Candle");
assert.match(freshPickModel.complimentary[0]?.meta ?? "", /Complimentary/);
assert.equal(freshPickModel.total, "RM138");
assert.equal(freshPickModel.footer, ORDER_DETAILS_CARD_FOOTER);

const dineIn = buildOrderDetailsCardModel(
  sampleReceipt({
    fulfilmentMethod: "dine_in",
    dineInVenue: "hyphen",
    guestCount: 2,
    reservationTime: "13:00",
    notes: null,
    paidAddons: [],
    complimentaryItems: [],
  }),
);
assert.equal(dineIn.fulfilment, "Dine-in");
assert.match(dineIn.collectionWhen, /1:00 PM/);
assert.equal(
  dineIn.collectionExtras.find((row) => row.label === "Venue")?.value,
  "Hyphen",
);
assert.equal(dineIn.notes, null);
assert.equal(dineIn.addons.length, 0);
assert.equal(dineIn.complimentary.length, 0);

assert.equal(orderDetailsFileName("WB-1001"), "whitebird-order-WB-1001.png");
assert.equal(orderDetailsFileName(null), "whitebird-order-details.png");
assert.equal(
  wrapCanvasText((text) => text.length, "one two three", 7).join("|"),
  "one two|three",
);
assert.equal(
  wrapCanvasText(
    (text) => text.length,
    "Dubai Chocolate Kunafa Slightly Sweeter",
    18,
  ).length > 1,
  true,
);
assert.equal(
  wrapCanvasText(
    (text) => text.length,
    "11 September 2026 · 2:00 PM\nPickup",
    80,
  ).join("|"),
  "11 September 2026 · 2:00 PM|Pickup",
);

type DrawnText = { text: string; x: number; y: number };

function createMockCtx(): {
  ctx: CanvasRenderingContext2D;
  texts: DrawnText[];
} {
  const texts: DrawnText[] = [];
  let textAlign = "left";
  const ctx = {
    save() {},
    restore() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y });
    },
    measureText(text: string) {
      return { width: text.length * 8 };
    },
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    letterSpacing: "0px",
    get textAlign() {
      return textAlign;
    },
    set textAlign(value: string) {
      textAlign = value;
    },
    textBaseline: "alphabetic",
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

function reconstructedLines(texts: DrawnText[]): Array<{ y: number; text: string }> {
  const groups = new Map<number, Array<{ x: number; text: string }>>();
  for (const entry of texts) {
    const y = Math.round(entry.y);
    const list = groups.get(y) ?? [];
    list.push({ x: entry.x, text: entry.text });
    groups.set(y, list);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, parts]) => ({
      y,
      text: parts
        .sort((a, b) => a.x - b.x)
        .map((part) => part.text)
        .join(""),
    }));
}

function assertReceiptLayout(
  receipt: GuestPreorderReceipt,
  extras: {
    cakes: string[];
    sizes: string[];
    quantities: string[];
    prices: string[];
    addons?: string[];
    complimentary?: string[];
    notes?: string | null;
  },
) {
  const { ctx, texts } = createMockCtx();
  const cardModel = buildOrderDetailsCardModel(receipt);
  const size = drawOrderDetailsCard(ctx, cardModel);
  assert.equal(size.width, 1080);
  assert.equal(size.height, 1800);
  for (const entry of texts) {
    assert.ok(entry.y > 0 && entry.y < 1800, `clipped y=${entry.y} "${entry.text}"`);
    assert.ok(entry.x >= 0 && entry.x <= 1080, `overflow x=${entry.x} "${entry.text}"`);
  }
  const lines = reconstructedLines(texts);
  const received = lines.filter((line) => line.text === "ORDER RECEIVED");
  assert.equal(received.length, 1);
  assert.ok((received[0]?.y ?? 9999) < 200);
  assert.equal(
    lines.filter((line) => line.text === "Order Received").length,
    0,
  );
  const joined = lines.map((line) => line.text).join("\n");
  const hasText = (value: string) => {
    assert.match(joined, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  };
  assert.match(joined, /WHITEBIRD/);
  assert.match(joined, /ORDER DETAILS/);
  assert.match(joined, /YOUR ORDER/);
  assert.match(joined, /Order number/);
  assert.match(joined, /Order placed/);
  assert.match(joined, /9 September 2026 · 8:38 AM/);
  assert.match(joined, /Customer/);
  hasText(receipt.guestName);
  assert.match(joined, /WhatsApp/);
  hasText(receipt.guestPhone);
  assert.match(joined, /Collection/);
  assert.match(joined, /Pickup|Dine-in|Delivery/);
  assert.match(joined, /TOTAL/);
  assert.match(joined, /Please keep this for your reference\./);
  for (const cake of extras.cakes) hasText(cake);
  for (const sizeLabel of extras.sizes) hasText(sizeLabel);
  for (const quantity of extras.quantities) hasText(quantity);
  for (const price of extras.prices) hasText(price);
  for (const addon of extras.addons ?? []) hasText(addon);
  for (const item of extras.complimentary ?? []) {
    hasText(item);
    assert.match(joined, /Complimentary/);
  }
  if (extras.notes) {
    assert.match(joined, /NOTE/);
    hasText(extras.notes.slice(0, 24));
  } else {
    assert.doesNotMatch(joined, /^NOTE$/m);
  }
  const footer = lines.find((line) =>
    line.text.includes("Please keep this for your reference"),
  );
  assert.ok((footer?.y ?? 0) > 1700);
}

assertReceiptLayout(sampleReceipt(), {
  cakes: ["Japanese Strawberry", "Pistachio Raspberry Kiss"],
  sizes: ['6"'],
  quantities: ["× 1", "× 2"],
  prices: ["RM78", "RM270", "RM3", "RM351"],
  addons: ["Birthday Card"],
  complimentary: ["Candle"],
  notes: "Write Happy Birthday on the card.",
});

assertReceiptLayout(
  sampleReceipt({
    items: [
      {
        key: "1",
        cakeName: "Chocolate D'Amour",
        sizeLabel: '6"',
        quantity: 1,
        unitPrice: 125,
      },
    ],
    paidAddons: [],
    complimentaryItems: [],
    notes: null,
    total: 125,
  }),
  {
    cakes: ["Chocolate D'Amour"],
    sizes: ['6"'],
    quantities: ["× 1"],
    prices: ["RM125"],
  },
);

assertReceiptLayout(
  sampleReceipt({
    items: [
      {
        key: "1",
        cakeName: "Chocolate D'Amour",
        sizeLabel: '6"',
        quantity: 2,
        unitPrice: 125,
      },
      {
        key: "2",
        cakeName: "Chocolate D'Amour",
        sizeLabel: '8"',
        quantity: 1,
        unitPrice: 165,
      },
    ],
    paidAddons: [],
    complimentaryItems: [],
    notes: null,
    total: 415,
  }),
  {
    cakes: ["Chocolate D'Amour"],
    sizes: ['6"', '8"'],
    quantities: ["× 2", "× 1"],
    prices: ["RM250", "RM165", "RM415"],
  },
);

assertReceiptLayout(
  sampleReceipt({
    isFreshPick: true,
    items: [
      {
        key: "fp1",
        cakeName: "Avocado",
        sizeLabel: '6"',
        quantity: 1,
        unitPrice: 135,
      },
    ],
    total: 138,
    notes: null,
  }),
  {
    cakes: ["Avocado"],
    sizes: ['6"'],
    quantities: ["× 1"],
    prices: ["RM135", "RM3", "RM138"],
    addons: ["Birthday Card"],
    complimentary: ["Candle"],
  },
);

assertReceiptLayout(
  sampleReceipt({
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
      {
        key: "3",
        cakeName: "Dubai Chocolate Kunafa Slightly Sweeter",
        sizeLabel: '8"',
        quantity: 1,
        unitPrice: 185,
      },
    ],
    notes: "Please prepare both cakes together and keep the card with the strawberry cake.",
    total: 536,
  }),
  {
    cakes: [
      "Japanese Strawberry",
      "Pistachio Raspberry Kiss",
      "Dubai Chocolate Kunafa Slightly Sweeter",
    ],
    sizes: ['6"', '8"'],
    quantities: ["× 1", "× 2"],
    prices: ["RM78", "RM270", "RM185", "RM3", "RM536"],
    addons: ["Birthday Card"],
    complimentary: ["Candle"],
    notes: "Please prepare both cakes together",
  },
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
assert.doesNotMatch(extraFormSrc, /Email me a copy of my order/);
assert.doesNotMatch(extraFormSrc, /name="email_submission_receipt_requested"/);
assert.doesNotMatch(extraFormSrc, /name="email"/);

const extraActionsSrc = readSrc(
  "src/workspaces/storefront/extra/actions.ts",
);
assert.doesNotMatch(extraActionsSrc, /scheduleGuestPreorderCopyEmail/);
assert.match(extraActionsSrc, /p_email: null/);
assert.match(extraActionsSrc, /p_email_submission_receipt_requested: false/);

const successSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontSuccessPage.tsx",
);
assert.match(successSrc, /Order Received/);
assert.match(successSrc, /Payment Pending/);
assert.match(successSrc, /Whitebird will contact you via WhatsApp/);
assert.match(successSrc, /SaveOrderDetailsButton/);
assert.match(successSrc, /receipt \? <SaveOrderDetailsButton receipt=\{receipt\} \/>/);
assert.doesNotMatch(successSrc, /receipt && !isFreshPick/);
assert.doesNotMatch(successSrc, /Email me a copy/);

const buttonSrc = readSrc(
  "src/workspaces/storefront/checkout/SaveOrderDetailsButton.tsx",
);
assert.match(buttonSrc, /Save Order Details/);
assert.match(buttonSrc, /shareOrDownloadOrderDetailsImage/);
assert.match(buttonSrc, /renderOrderDetailsPng/);
assert.match(buttonSrc, /ensureStorefrontCanvasFonts/);
assert.doesNotMatch(buttonSrc, /await renderOrderDetailsPng/);
assert.doesNotMatch(buttonSrc, /await ensureStorefrontCanvasFonts/);
assert.match(buttonSrc, /const blob = renderOrderDetailsPng\(model\)/);
assert.match(buttonSrc, /const sharing = shareOrDownloadOrderDetailsImage/);
assert.match(buttonSrc, /result\.action === "preview"/);
assert.match(buttonSrc, /Press and hold the image to save it/);
assert.match(buttonSrc, /createPortal/);
assert.doesNotMatch(buttonSrc, /window\.open/);
assert.doesNotMatch(buttonSrc, /location\.assign/);
assert.doesNotMatch(buttonSrc, /resend/i);
assert.doesNotMatch(buttonSrc, /mailto:/);

const receiptSrc = readSrc("src/workspaces/storefront/checkout/receipt.ts");
assert.match(receiptSrc, /guestPreorderReceiptAuthorized/);
assert.match(receiptSrc, /receiptCookieSecure/);
assert.match(receiptSrc, /x-forwarded-proto/);
assert.doesNotMatch(
  receiptSrc,
  /secure: process\.env\.NODE_ENV === "production"/,
);
assert.match(receiptSrc, /customer_notes,/);
assert.match(receiptSrc, /customer_notes \?\? ""/);
assert.doesNotMatch(receiptSrc, /^\s+notes,$/m);
assert.match(receiptSrc, /path: "\/order"/);
assert.match(receiptSrc, /httpOnly: true/);
assert.match(receiptSrc, /sameSite: "lax"/);
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
assert.match(cardSrc, /complimentaryItems/);
assert.match(cardSrc, /Complimentary/);
assert.match(cardSrc, /ORDER_DETAILS_PNG_WIDTH = 1080/);
assert.match(cardSrc, /ORDER_DETAILS_PNG_HEIGHT = 1800/);
assert.match(cardSrc, /Order placed/);
assert.match(cardSrc, /formatCustomerOrderPlacedAt/);
assert.match(cardSrc, /title: "ORDER RECEIVED"/);
assert.doesNotMatch(cardSrc, /title: "Order Received"/);
assert.match(cardSrc, /Newsreader/);
assert.match(cardSrc, /Outfit/);
assert.match(cardSrc, /--font-display/);
assert.match(cardSrc, /--font-sans/);
assert.match(cardSrc, /ensureStorefrontCanvasFonts/);
assert.match(cardSrc, /document\.fonts\.ready/);
assert.match(cardSrc, /Promise\.race/);
assert.match(cardSrc, /toDataURL/);
assert.match(cardSrc, /isIosTouchDevice/);
assert.match(cardSrc, /resolveOrderDetailsSavePath/);
assert.match(cardSrc, /isSecureContext/);
assert.match(cardSrc, /action: "preview"/);
assert.doesNotMatch(cardSrc, /window\.open/);
assert.doesNotMatch(cardSrc, /location\.assign/);
assert.match(cardSrc, /isShareNotAllowedError/);
assert.match(cardSrc, /isShareUnavailableError/);
assert.doesNotMatch(cardSrc, /toBlob/);
assert.doesNotMatch(cardSrc, /Georgia/);
assert.doesNotMatch(cardSrc, /Palatino/);
assert.doesNotMatch(cardSrc, /Segoe UI/);
assert.match(receiptSrc, /created_at,/);
assert.match(receiptSrc, /placedAt:/);
assert.doesNotMatch(cardSrc, /html2canvas/);
assert.doesNotMatch(cardSrc, /from "resend"/);

const downloads: string[] = [];

function pngBlob(): Blob {
  return new Blob(["png"], { type: "image/png" });
}

async function runShareTests() {
  assert.equal(
    resolveOrderDetailsSavePath({
      isSecureContext: false,
      hasShare: false,
      canShareFiles: false,
      isIos: true,
    }),
    "preview",
    "A: iPhone Safari over HTTP has no Web Share; stay on-page",
  );
  assert.equal(
    resolveOrderDetailsSavePath({
      isSecureContext: true,
      hasShare: true,
      canShareFiles: false,
      isIos: true,
    }),
    "preview",
    "B: share exists but file sharing is unsupported",
  );
  assert.equal(
    resolveOrderDetailsSavePath({
      isSecureContext: true,
      hasShare: true,
      canShareFiles: true,
      isIos: true,
    }),
    "share",
  );
  assert.equal(
    resolveOrderDetailsSavePath({
      isSecureContext: true,
      hasShare: true,
      canShareFiles: "unknown",
      isIos: true,
    }),
    "share",
  );
  assert.equal(
    resolveOrderDetailsSavePath({
      isSecureContext: false,
      hasShare: false,
      canShareFiles: false,
      isIos: false,
    }),
    "download",
  );

  const sampleFile = new File([pngBlob()], "whitebird-order-WB-1001.png", {
    type: "image/png",
  });
  assert.equal(
    canShareOrderDetailsFile(sampleFile, {
      share: async () => undefined,
    }),
    true,
    "share without canShare still attempts file share",
  );
  assert.equal(
    canShareOrderDetailsFile(sampleFile, {
      share: async () => undefined,
      canShare: () => false,
    }),
    false,
  );

  let insecureShareCalls = 0;
  const httpIphone = await shareOrDownloadOrderDetailsImage({
    blob: pngBlob(),
    fileName: "whitebird-order-WB-http.png",
    title: "Whitebird order details",
    isIos: true,
    isSecureContext: false,
    nav: {
      canShare: () => true,
      share: async () => {
        insecureShareCalls += 1;
      },
    },
    download: (_blob, fileName) => {
      downloads.push(fileName);
    },
    createObjectUrl: () => "blob:preview-http",
  });
  assert.equal(httpIphone.action, "preview");
  assert.equal(httpIphone.objectUrl, "blob:preview-http");
  assert.equal(
    insecureShareCalls,
    0,
    "A: do not call share outside a secure context",
  );
  assert.equal(downloads.includes("whitebird-order-WB-http.png"), false);

  const shared = await shareOrDownloadOrderDetailsImage({
    blob: pngBlob(),
    fileName: "whitebird-order-WB-1001.png",
    title: "Whitebird order details",
    isSecureContext: true,
    nav: {
      canShare: () => true,
      share: async () => undefined,
    },
    download: () => {
      downloads.push("should-not-download");
    },
  });
  assert.equal(shared.action, "shared");
  assert.equal(downloads.length, 0);

  const downloaded = await shareOrDownloadOrderDetailsImage({
    blob: pngBlob(),
    fileName: "whitebird-order-WB-1001.png",
    title: "Whitebird order details",
    isIos: false,
    isSecureContext: true,
    nav: {},
    download: (_blob, fileName) => {
      downloads.push(fileName);
    },
  });
  assert.equal(downloaded.action, "downloaded");
  assert.deepEqual(downloads, ["whitebird-order-WB-1001.png"]);

  const fallbackAfterShareFail = await shareOrDownloadOrderDetailsImage({
    blob: pngBlob(),
    fileName: "whitebird-order-WB-share-fail.png",
    title: "Whitebird order details",
    isSecureContext: true,
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
  assert.equal(fallbackAfterShareFail.action, "shared");
  assert.equal(
    downloads.includes("whitebird-order-WB-share-fail.png"),
    false,
    "one terminal action: after share is invoked, do not also open/download",
  );

  const abortAfterShare = await shareOrDownloadOrderDetailsImage({
    blob: pngBlob(),
    fileName: "whitebird-order-WB-abort.png",
    title: "Whitebird order details",
    isSecureContext: true,
    nav: {
      canShare: () => true,
      share: async () => {
        const error = new Error("abort");
        error.name = "AbortError";
        throw error;
      },
    },
    download: (_blob, fileName) => {
      downloads.push(fileName);
    },
  });
  assert.equal(abortAfterShare.action, "shared");
  assert.equal(downloads.includes("whitebird-order-WB-abort.png"), false);
  assert.equal(
    isShareAbortError(Object.assign(new Error("x"), { name: "AbortError" })),
    true,
  );
  assert.equal(
    isShareNotAllowedError(
      Object.assign(new Error("x"), { name: "NotAllowedError" }),
    ),
    true,
  );
  assert.equal(
    isShareUnavailableError(
      Object.assign(new Error("x"), { name: "TypeError" }),
    ),
    true,
  );

  const fallbackAfterNotAllowed = await shareOrDownloadOrderDetailsImage({
    blob: pngBlob(),
    fileName: "whitebird-order-WB-1002.png",
    title: "Whitebird order details",
    isIos: false,
    isSecureContext: true,
    nav: {
      canShare: () => true,
      share: async () => {
        const error = new Error("not allowed");
        error.name = "NotAllowedError";
        throw error;
      },
    },
    download: (_blob, fileName) => {
      downloads.push(fileName);
    },
  });
  assert.equal(fallbackAfterNotAllowed.action, "downloaded");
  assert.equal(
    downloads.filter((name) => name === "whitebird-order-WB-1002.png").length,
    1,
    "desktop NotAllowedError falls back to one download",
  );

  const iosNotAllowed = await shareOrDownloadOrderDetailsImage({
    blob: pngBlob(),
    fileName: "whitebird-order-WB-ios-na.png",
    title: "Whitebird order details",
    isIos: true,
    isSecureContext: true,
    nav: {
      canShare: () => true,
      share: async () => {
        const error = new Error("not allowed");
        error.name = "NotAllowedError";
        throw error;
      },
    },
    download: (_blob, fileName) => {
      downloads.push(fileName);
    },
    createObjectUrl: () => "blob:preview-not-allowed",
  });
  assert.equal(iosNotAllowed.action, "preview");
  assert.equal(iosNotAllowed.objectUrl, "blob:preview-not-allowed");
  assert.equal(downloads.includes("whitebird-order-WB-ios-na.png"), false);

  const iosNoFileShare = await shareOrDownloadOrderDetailsImage({
    blob: pngBlob(),
    fileName: "whitebird-order-WB-no-files.png",
    title: "Whitebird order details",
    isIos: true,
    isSecureContext: true,
    nav: {
      canShare: () => false,
      share: async () => {
        throw new Error("should not share");
      },
    },
    download: (_blob, fileName) => {
      downloads.push(fileName);
    },
    createObjectUrl: () => "blob:preview-no-files",
  });
  assert.equal(iosNoFileShare.action, "preview");
  assert.equal(iosNoFileShare.objectUrl, "blob:preview-no-files");
  assert.equal(downloads.includes("whitebird-order-WB-no-files.png"), false);

  assert.equal(
    isIosTouchDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }),
    true,
  );
  assert.equal(
    isIosTouchDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" }),
    false,
  );
  assert.equal(
    isIosTouchDevice({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      platform: "MacIntel",
      maxTouchPoints: 5,
    }),
    true,
  );
}

void runShareTests()
  .then(() => {
    console.log("PASS save order details");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
