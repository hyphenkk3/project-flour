/**
 * Whole Cake Order Guide — shared copy on staff + customer surfaces.
 * Run: npx tsx scripts/test-order-guide.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ORDER_GUIDE_LINES,
  ORDER_GUIDE_TITLE,
} from "@/engines/orders/order-guide";

const NO_WORDING = "No wording on cakes or cake boards.";
const NO_CUSTOM = "Customised cake decoration is not available.";

assert.equal(ORDER_GUIDE_TITLE, "Order guide");
assert.equal(ORDER_GUIDE_LINES.length, 2);
assert.equal(ORDER_GUIDE_LINES[0], NO_WORDING);
assert.equal(ORDER_GUIDE_LINES[1], NO_CUSTOM);

function readSrc(relativePath: string): string {
  return readFileSync(resolve(relativePath), "utf8");
}

const engineSrc = readSrc("src/engines/orders/order-guide.ts");
assert.match(engineSrc, /No wording on cakes or cake boards\./);
assert.match(engineSrc, /Customised cake decoration is not available\./);

const calloutSrc = readSrc("src/components/ui/OrderGuideCallout.tsx");
assert.match(calloutSrc, /@\/engines\/orders\/order-guide/);
assert.match(calloutSrc, /ORDER_GUIDE_LINES/);
assert.match(calloutSrc, /ORDER_GUIDE_TITLE/);
assert.doesNotMatch(calloutSrc, /No wording on cakes or cake boards\./);

const staffSrc = readSrc("src/workspaces/owner/orders/OrderWorkspaceForm.tsx");
assert.match(staffSrc, /@\/components\/ui\/OrderGuideCallout/);
assert.match(staffSrc, /<OrderGuideCallout/);
assert.doesNotMatch(staffSrc, /No wording on cakes or cake boards\./);
assert.doesNotMatch(staffSrc, /Customised cake decoration is not available\./);

const detailSrc = readSrc(
  "src/workspaces/storefront/catalog/CakeDetailPurchasePanel.tsx",
);
assert.match(detailSrc, /@\/components\/ui\/OrderGuideCallout/);
assert.match(detailSrc, /<OrderGuideCallout/);
assert.doesNotMatch(detailSrc, /No wording on cakes or cake boards\./);

const checkoutSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(checkoutSrc, /@\/components\/ui\/OrderGuideCallout/);
assert.match(checkoutSrc, /<OrderGuideCallout/);
assert.doesNotMatch(checkoutSrc, /No wording on cakes or cake boards\./);

const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
assert.doesNotMatch(extraFormSrc, /order-guide/);
assert.doesNotMatch(extraFormSrc, /OrderGuideCallout/);
assert.doesNotMatch(extraFormSrc, /ORDER_GUIDE/);
assert.doesNotMatch(extraFormSrc, /No wording on cakes or cake boards\./);

const extraPageSrc = readSrc(
  "src/workspaces/storefront/extra/StorefrontExtraOrderPage.tsx",
);
assert.doesNotMatch(extraPageSrc, /order-guide/);
assert.doesNotMatch(extraPageSrc, /OrderGuideCallout/);

const fulfilmentSrc = readSrc("src/engines/orders/fulfilment.ts");
assert.doesNotMatch(fulfilmentSrc, /order-guide/);
assert.doesNotMatch(fulfilmentSrc, /ORDER_GUIDE/);

const dineInHoursSrc = readSrc("src/engines/business-calendar/dine-in-hours.ts");
assert.doesNotMatch(dineInHoursSrc, /order-guide/);
assert.doesNotMatch(dineInHoursSrc, /ORDER_GUIDE/);

const successSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontSuccessPage.tsx",
);
assert.doesNotMatch(successSrc, /OrderGuideCallout/);
assert.doesNotMatch(successSrc, /order-guide/);

console.log("PASS Order guide");
