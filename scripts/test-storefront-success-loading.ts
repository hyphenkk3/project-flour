/**
 * Order Received route loading shell (static).
 * Run: npx tsx scripts/test-storefront-success-loading.ts
 *
 * Does not call Supabase or mutate catalogues, carts, or orders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const loadingRoute = "src/app/order/success/loading.tsx";
const loadingShell =
  "src/workspaces/storefront/checkout/StorefrontSuccessLoading.tsx";
const successPage =
  "src/workspaces/storefront/checkout/StorefrontSuccessPage.tsx";
const successRoute = "src/app/order/success/page.tsx";
const recapSrcPath =
  "src/workspaces/storefront/checkout/SuccessReceiptRecap.tsx";
const submitSrc = "src/workspaces/storefront/checkout/actions.ts";

assert.equal(existsSync(resolve(process.cwd(), loadingRoute)), true);
assert.equal(existsSync(resolve(process.cwd(), loadingShell)), true);

const loadingRouteSrc = readSrc(loadingRoute);
const loadingShellSrc = readSrc(loadingShell);
const combined = `${loadingRouteSrc}\n${loadingShellSrc}`;
const successSrc = readSrc(successPage);
const recapSrc = readSrc(recapSrcPath);

assert.match(loadingRouteSrc, /StorefrontSuccessLoading/);
assert.doesNotMatch(loadingRouteSrc, /["']use client["']/);
assert.doesNotMatch(loadingShellSrc, /["']use client["']/);

assert.doesNotMatch(combined, /createClient|supabase|from\("/);
assert.doesNotMatch(combined, /cookies\(|sessionStorage|localStorage/);
assert.doesNotMatch(combined, /fetch\(|getGuestPreorderReceipt|loadSuccessPageReceipt/);
assert.doesNotMatch(combined, /next\/image|CakePhotoImage/);
assert.doesNotMatch(combined, /useEffect|useState|useRouter/);
assert.doesNotMatch(combined, /Avocado|Pandan|RM135|RM130|OCT265/);
assert.doesNotMatch(combined, /submit_guest_preorder/);

assert.match(loadingShellSrc, /bg-paper mx-auto flex min-h-screen max-w-lg/);
assert.match(loadingShellSrc, /Order Received/);
assert.match(loadingShellSrc, /Loading your order details/);
assert.match(loadingShellSrc, /aria-busy/);
assert.match(loadingShellSrc, /StorefrontSuccessRecapSkeleton/);
assert.match(loadingShellSrc, /ORDER_DETAILS_CARD_PAYMENT/);
assert.match(loadingShellSrc, /ORDER_DETAILS_CARD_CONTACT/);

assert.match(successSrc, /StorefrontSuccessRecapSkeleton/);
assert.match(successSrc, /<Suspense fallback=\{<StorefrontSuccessRecapSkeleton \/>\}>/);
assert.match(successSrc, /getGuestPreorderReceipt/);
assert.match(successSrc, /loadSuccessPageReceipt/);
assert.doesNotMatch(successSrc, /<StorefrontSuccessLoading/);

assert.match(readSrc(successRoute), /StorefrontSuccessPage/);
assert.doesNotMatch(readSrc(successRoute), /StorefrontSuccessLoading/);

assert.match(recapSrc, /SuccessRecapPerfProbe/);
assert.match(recapSrc, /receipt\.total/);
assert.match(recapSrc, /receipt\.adjustments/);

assert.match(readSrc(submitSrc), /submit_guest_preorder_with_catalogue_voucher/);
assert.doesNotMatch(readSrc(submitSrc), /StorefrontSuccessLoading/);

const formSrc = readSrc("src/workspaces/storefront/checkout/GuestCheckoutForm.tsx");
const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx",
);
const navigateSrc = readSrc(
  "src/workspaces/storefront/checkout/CheckoutDevPerf.tsx",
);
assert.match(formSrc, /onCommitted: \(\) => \{\s*setReceivedShell\(true\);/);
assert.match(formSrc, /<StorefrontSuccessLoading \/>/);
assert.match(formSrc, /CheckoutReceivedShellProbe flow="preorder"/);
assert.match(extraFormSrc, /onCommitted: \(\) => \{\s*setReceivedShell\(true\);/);
assert.match(extraFormSrc, /<StorefrontSuccessLoading \/>/);
assert.match(
  navigateSrc,
  /if \(result\.error \|\| !result\.orderId\) \{\s*return result;\s*\}\s*input\.markNavigated\(\);\s*input\.onCommitted\?\.\(\);/,
);
assert.match(
  navigateSrc,
  /input\.onCommitted\?\.\(\);[\s\S]*input\.replace\(input\.hrefForOrderId\(result\.orderId\)\)/,
);

console.log("PASS storefront success loading shell");
