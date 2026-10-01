import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read(
  "supabase/migrations/20261001002046_fresh_pick_pricing_cancellation_release.sql",
);
const storefrontQuery = read("src/workspaces/storefront/extra/queries.ts");
const storefrontActions = read("src/workspaces/storefront/extra/actions.ts");
const cart = read("src/workspaces/storefront/extra/fresh-pick-cart.ts");
const detailForm = read("src/workspaces/storefront/extra/GuestExtraOrderForm.tsx");
const checkoutForm = read("src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx");
const operationsForm = read("src/workspaces/owner/orders/OrderWorkspaceForm.tsx");

assert.match(storefrontQuery, /library_cake_size_price_on/);
assert.doesNotMatch(
  storefrontQuery,
  /from\("library_cake_sizes"\)[\s\S]{0,100}select\("id, price"\)/,
);
assert.match(detailForm, /loadFreshPickPrices\(\[extra\.id\], pickupDate\)/);
assert.match(checkoutForm, /loadFreshPickPrices\(extraStockIds, selectedDate\)/);
assert.match(migration, /library_cake_size_price_on\(size_row\.id, p_pickup_date\)/);
assert.doesNotMatch(migration, /coalesce\(size_row\.price/);

assert.match(cart, /cakeId: string \| null/);
assert.match(cart, /cakeSizeId: string \| null/);
assert.match(checkoutForm, /cakeId: item\.cakeId/);
assert.match(checkoutForm, /sizeId: item\.cakeSizeId/);
assert.match(checkoutForm, /"fresh_pick"/);
assert.match(storefrontActions, /p_extra_stock_ids: extraStockIds/);

assert.match(
  operationsForm,
  /order\.orderSource === "customer_website" && Boolean\(order\.extraStockId\)/,
);
assert.match(
  operationsForm,
  /!isFreshPickCustomerOrder && selectedPickupDate < preorderEarliestYmd/,
);

assert.match(migration, /status <> 'cancelled'/);
assert.match(migration, /public\.order_net_received\(new\.id\) <= 0/);
assert.match(
  migration,
  /e\.order_id = new\.id[\s\S]*e\.sold_at is not null[\s\S]*e\.lifecycle = 'confirmed'[\s\S]*e\.cut_into_slices_at is null/,
);
assert.match(migration, /'released'/);
assert.match(migration, /customer_order_cancelled/);
assert.match(migration, /new\.order_source = 'customer_website'/);
assert.match(migration, /orders_release_fresh_pick_on_cancel/);

console.log("PASS Fresh Pick pricing, voucher context, Operations, cancellation, and uniqueness contracts");
