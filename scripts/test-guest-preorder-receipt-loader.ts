/**
 * Shared guest success recap loader uses orders.customer_notes, not orders.notes.
 * Selecting `notes` returns PostgREST 42703 and hides Save Order Details even
 * when wb_guest_preorder_receipt authorizes the just-submitted order.
 * Run: npx tsx scripts/test-guest-preorder-receipt-loader.ts
 *
 * Static only. Does not mutate orders or extras.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  attachReceiptItemPhotos,
  guestPreorderReceiptAuthorized,
  receiptCookieSecure,
} from "@/workspaces/storefront/checkout/receipt";
import {
  ORDER_DETAILS_NOTICE_BODY,
  orderDetailsNoticeBody,
  orderDetailsNoticeMark,
} from "@/workspaces/storefront/checkout/order-details-card";
import {
  FRESH_PICKS_SUCCESS_NOTICE,
  FRESH_PICKS_SUCCESS_NOTICE_MARK,
} from "@/engines/extra/customer-fresh-picks";
import { calculateCommercialSubtotal } from "@/engines/orders/totals";
import { storefrontPhotoForSize } from "@/workspaces/storefront/catalog/cake-photo-map";
import type { StorefrontCakePhoto } from "@/types/storefront";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const receiptSrc = readSrc("src/workspaces/storefront/checkout/receipt.ts");
const successSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontSuccessPage.tsx",
);
const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
const checkoutActionsSrc = readSrc(
  "src/workspaces/storefront/checkout/actions.ts",
);

assert.match(receiptSrc, /customer_notes,/);
assert.match(receiptSrc, /customer_notes \?\? ""/);
assert.match(receiptSrc, /created_at,/);
assert.match(receiptSrc, /placedAt:/);
assert.doesNotMatch(receiptSrc, /^\s+notes,$/m);
assert.doesNotMatch(receiptSrc, /\.notes \?\? ""/);
assert.match(receiptSrc, /order_items \(/);
assert.match(receiptSrc, /size_label/);
assert.match(receiptSrc, /unit_price/);
assert.match(receiptSrc, /order_paid_addons \(/);
assert.match(receiptSrc, /order_complimentary_items \(/);
assert.match(receiptSrc, /fulfilment_method/);
assert.match(receiptSrc, /extra_stock_id/);
assert.match(receiptSrc, /guestPreorderReceiptAuthorized/);
assert.match(receiptSrc, /GUEST_PREORDER_RECEIPT_COOKIE = "wb_guest_preorder_receipt"/);
assert.match(receiptSrc, /path: "\/order"/);
assert.match(receiptSrc, /httpOnly: true/);
assert.match(receiptSrc, /sameSite: "lax"/);
assert.match(receiptSrc, /\.is\("customer_id", null\)/);
assert.match(receiptSrc, /calculateCommercialSubtotal/);

assert.equal(guestPreorderReceiptAuthorized("", "abc"), false);
assert.equal(guestPreorderReceiptAuthorized("a", null), false);
assert.equal(guestPreorderReceiptAuthorized("order-1", "order-2"), false);
assert.equal(guestPreorderReceiptAuthorized("order-1", "order-1"), true);

assert.equal(receiptCookieSecure("https"), true);
assert.equal(receiptCookieSecure("https, http"), true);
assert.equal(receiptCookieSecure("http"), false);
assert.equal(receiptCookieSecure(null), false);
assert.equal(receiptCookieSecure(""), false);
assert.match(receiptSrc, /receiptCookieSecure/);
assert.match(receiptSrc, /x-forwarded-proto/);
assert.doesNotMatch(
  receiptSrc,
  /secure: process\.env\.NODE_ENV === "production"/,
);

assert.equal(
  calculateCommercialSubtotal({
    items: [{ unitPrice: 135, quantity: 1 }],
    paidAddons: [{ unitPrice: 3, quantity: 1 }],
  }),
  138,
);

assert.match(successSrc, /getGuestPreorderReceipt/);
assert.match(successSrc, /receipt \? <SaveOrderDetailsButton receipt=\{receipt\} \/>/);
assert.doesNotMatch(successSrc, /receipt && !isFreshPick/);
assert.match(successSrc, /receipt\.items\.map/);
assert.match(successSrc, /receipt\.paidAddons\.map/);
assert.match(successSrc, /receipt\.notes/);
assert.match(successSrc, /formatRm\(receipt\.total\)/);
assert.match(successSrc, /FRESH_PICKS_SUCCESS_FLOW/);

assert.match(extraActionsSrc, /setGuestPreorderReceiptCookie/);
assert.match(checkoutActionsSrc, /setGuestPreorderReceiptCookie/);

assert.match(receiptSrc, /cake_id,/);
assert.match(receiptSrc, /cake_size_id,/);
assert.match(receiptSrc, /cakeId:/);
assert.match(receiptSrc, /cakeSizeId:/);
assert.match(receiptSrc, /library_cake_photos/);
assert.match(receiptSrc, /mapStorefrontCakePhoto/);
assert.match(receiptSrc, /storefrontPhotoForSize\(photos, item\.cakeSizeId\)/);
assert.doesNotMatch(receiptSrc, /resolveCatalogueListingPhoto/);
assert.doesNotMatch(receiptSrc, /storefrontCatalogueListingPhoto/);
assert.doesNotMatch(receiptSrc, /resolveCakePhoto\(/);

const extraQueriesSrc = readSrc("src/workspaces/storefront/extra/queries.ts");
assert.match(
  extraQueriesSrc,
  /resolveCakePhoto\(photos, row\.library_cake_size_id\)/,
);
assert.doesNotMatch(extraQueriesSrc, /resolveCatalogueListingPhoto/);
assert.doesNotMatch(extraQueriesSrc, /storefrontCatalogueListingPhoto/);

assert.match(successSrc, /CakePhotoImage/);
assert.match(successSrc, /item\.imageUrl/);
assert.match(successSrc, /ORDER_DETAILS_NOTICE_TITLE/);
assert.match(successSrc, /orderDetailsNoticeBody\(isFreshPick\)/);
assert.match(successSrc, /orderDetailsNoticeMark\(isFreshPick\)/);
assert.doesNotMatch(successSrc, /const noticeMark = "24 hours"/);
assert.doesNotMatch(successSrc, /const noticeMark = "30 minutes"/);
assert.equal(
  orderDetailsNoticeBody(false),
  "If you do not receive a confirmation from us within 24 hours, please contact us via WhatsApp.",
);
assert.equal(orderDetailsNoticeBody(false), ORDER_DETAILS_NOTICE_BODY);
assert.equal(orderDetailsNoticeMark(false), "24 hours");
assert.doesNotMatch(orderDetailsNoticeBody(false), /30 minutes/);
assert.equal(
  orderDetailsNoticeBody(true),
  "If you do not receive a confirmation from us within 30 minutes, please contact us via WhatsApp.",
);
assert.equal(orderDetailsNoticeBody(true), FRESH_PICKS_SUCCESS_NOTICE);
assert.equal(orderDetailsNoticeMark(true), FRESH_PICKS_SUCCESS_NOTICE_MARK);
assert.doesNotMatch(orderDetailsNoticeBody(true), /24 hours/);
assert.ok(
  successSrc.indexOf("{contactLine}") < successSrc.indexOf("<aside"),
);
assert.ok(successSrc.indexOf("<aside") < successSrc.indexOf("Order recap"));
assert.doesNotMatch(successSrc, /resolveCatalogueListingPhoto/);
assert.doesNotMatch(successSrc, /storefrontCatalogueListingPhoto/);

function photo(
  partial: Partial<StorefrontCakePhoto> &
    Pick<StorefrontCakePhoto, "id" | "url" | "cakeSizeId">,
): StorefrontCakePhoto {
  return {
    altText: `${partial.id} alt`,
    sortOrder: 0,
    isDefault: false,
    ...partial,
  };
}

const size4 = "size-4";
const size6 = "size-6";
const size8 = "size-8";
const cakePhotos: StorefrontCakePhoto[] = [
  photo({
    id: "p4",
    url: "https://photos.example/4.jpg",
    cakeSizeId: size4,
    sortOrder: 1,
  }),
  photo({
    id: "p6",
    url: "https://photos.example/6.jpg",
    cakeSizeId: size6,
    sortOrder: 2,
    isDefault: true,
  }),
  photo({
    id: "p8",
    url: "https://photos.example/8.jpg",
    cakeSizeId: size8,
    sortOrder: 3,
  }),
];

assert.equal(storefrontPhotoForSize(cakePhotos, size4)?.url, "https://photos.example/4.jpg");
assert.equal(storefrontPhotoForSize(cakePhotos, size6)?.url, "https://photos.example/6.jpg");
assert.equal(storefrontPhotoForSize(cakePhotos, size8)?.url, "https://photos.example/8.jpg");

const mixed = attachReceiptItemPhotos(
  [
    {
      key: "a",
      cakeId: "cake-1",
      cakeSizeId: size4,
      cakeName: "Avocado",
      sizeLabel: '4"',
      quantity: 1,
      unitPrice: 88,
    },
    {
      key: "b",
      cakeId: "cake-1",
      cakeSizeId: size6,
      cakeName: "Avocado",
      sizeLabel: '6"',
      quantity: 1,
      unitPrice: 135,
    },
    {
      key: "c",
      cakeId: "cake-1",
      cakeSizeId: size8,
      cakeName: "Avocado",
      sizeLabel: '8"',
      quantity: 1,
      unitPrice: 165,
    },
  ],
  new Map([["cake-1", cakePhotos]]),
);
assert.equal(mixed[0]?.cakeId, "cake-1");
assert.equal(mixed[0]?.cakeSizeId, size4);
assert.equal(mixed[0]?.imageUrl, "https://photos.example/4.jpg");
assert.equal(mixed[1]?.imageUrl, "https://photos.example/6.jpg");
assert.equal(mixed[2]?.imageUrl, "https://photos.example/8.jpg");
assert.equal(mixed[0]?.sizeLabel, '4"');
assert.equal(mixed[1]?.sizeLabel, '6"');
assert.equal(mixed[2]?.sizeLabel, '8"');

const missingExact = attachReceiptItemPhotos(
  [
    {
      key: "d",
      cakeId: "cake-1",
      cakeSizeId: "size-missing",
      cakeName: "Avocado",
      sizeLabel: '10"',
      quantity: 1,
      unitPrice: 188,
    },
  ],
  new Map([["cake-1", cakePhotos]]),
);
assert.equal(
  missingExact[0]?.imageUrl,
  "https://photos.example/6.jpg",
  "missing exact size follows resolveCakePhoto default fallback",
);

const noSizePhotos: StorefrontCakePhoto[] = [
  photo({
    id: "only",
    url: "https://photos.example/sort.jpg",
    cakeSizeId: null,
    sortOrder: 0,
    isDefault: false,
    altText: "sort fallback",
  }),
];
const sortFallback = attachReceiptItemPhotos(
  [
    {
      key: "e",
      cakeId: "cake-sort",
      cakeSizeId: "size-unknown",
      cakeName: "Matcha",
      sizeLabel: '6"',
      quantity: 1,
      unitPrice: 125,
    },
  ],
  new Map([["cake-sort", noSizePhotos]]),
);
assert.equal(sortFallback[0]?.imageUrl, "https://photos.example/sort.jpg");

const legacy = attachReceiptItemPhotos(
  [
    {
      key: "legacy",
      cakeId: null,
      cakeSizeId: null,
      cakeName: "Legacy Cake",
      sizeLabel: '6"',
      quantity: 1,
      unitPrice: 100,
    },
  ],
  new Map([["cake-1", cakePhotos]]),
);
assert.equal(legacy.length, 1);
assert.equal(legacy[0]?.cakeName, "Legacy Cake");
assert.equal(legacy[0]?.imageUrl, null);
assert.equal(legacy[0]?.imageAlt, null);

console.log("PASS guest preorder receipt loader uses customer_notes");
