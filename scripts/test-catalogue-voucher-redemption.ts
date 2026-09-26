/**
 * Catalogue voucher redemption controls — schema, selection, admin, customer hide.
 * Run: npx tsx scripts/test-catalogue-voucher-redemption.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const migration = readSrc(
  "supabase/migrations/20260926120000_catalogue_voucher_redemption_controls.sql",
);
assert.match(migration, /add column if not exists redemption_limit integer/);
assert.match(migration, /create table if not exists public.catalogue_voucher_redemptions/);
assert.match(migration, /status in \('redeemed', 'released'\)/);
assert.match(migration, /catalogue_voucher_redemptions_one_active_per_order/);
assert.match(migration, /assert_catalogue_voucher_redemption_available/);
assert.match(migration, /Voucher is no longer available/);
assert.match(migration, /record_catalogue_voucher_redemption/);
assert.match(migration, /release_catalogue_voucher_redemptions_for_order/);
assert.match(migration, /status = 'redeemed'/);
assert.match(migration, /trg_release_catalogue_voucher_on_order_cancel/);
assert.match(migration, /list_catalogue_voucher_redemption_events/);
assert.match(migration, /get_catalogue_voucher_redemption_summaries/);
assert.match(migration, /_current_staff_role_code\(\) is distinct from 'owner'/);
assert.match(migration, /for update/);
assert.match(
  migration,
  /revoke all on function public.release_catalogue_voucher_redemptions_for_order\(uuid, uuid, text\) from public, anon, authenticated/,
);
assert.match(
  migration,
  /revoke all on function public.record_catalogue_voucher_redemption\(uuid, uuid, uuid, numeric, uuid\) from public, anon, authenticated/,
);
assert.doesNotMatch(migration, /physical_discount_vouchers/);
assert.doesNotMatch(migration, /august_promo_2026' then\s+raise exception 'Only one discount/);

const apply = migration.slice(
  migration.indexOf("create or replace function public.apply_catalogue_voucher_to_guest_order"),
);
assert.match(apply, /assert_catalogue_voucher_redemption_available/);
assert.match(apply, /record_catalogue_voucher_redemption/);
assert.match(apply, /A catalogue voucher is already applied to this order/);
assert.match(apply, /Cannot stack with August Promo/);
assert.match(apply, /Cannot stack with an RM10 Discount Card/);

const publicList = migration.slice(
  migration.indexOf("create or replace function public.list_public_catalogue_vouchers()"),
  migration.indexOf("create or replace function public.apply_catalogue_voucher_to_guest_order"),
);
assert.match(publicList, /catalogue_voucher_active_redemption_count/);
assert.doesNotMatch(publicList, /redemption_limit,/);
assert.doesNotMatch(publicList, /remaining/);
assert.doesNotMatch(publicList, /active_count/);

const engine = readSrc("src/engines/vouchers/catalogue-voucher.ts");
assert.match(engine, /compareCatalogueVoucherSpecificity/);
assert.match(engine, /selectEligibleCatalogueVoucher/);

const presentation = readSrc(
  "src/engines/vouchers/catalogue-promotion-presentation.ts",
);
assert.match(presentation, /selectCatalogueVoucherBySpecificity/);
assert.doesNotMatch(presentation, /remaining/);
assert.doesNotMatch(presentation, /redemptionLimit/);

const customerFiles = [
  "src/workspaces/storefront/home/StorefrontHomePage.tsx",
  "src/workspaces/storefront/home/StorefrontBrowsePage.tsx",
  "src/workspaces/storefront/offers/CakeOfferCard.tsx",
  "src/workspaces/storefront/offers/CatalogueOfferCard.tsx",
  "src/workspaces/storefront/offers/StorefrontPromotionBadge.tsx",
  "src/workspaces/storefront/offers/useEligibleCatalogueVoucher.ts",
];
for (const file of customerFiles) {
  const src = readSrc(file);
  assert.doesNotMatch(src, /remaining/);
  assert.doesNotMatch(src, /redemption_limit|redemptionLimit/);
  assert.doesNotMatch(src, /73\/100|27 remaining/);
}

const form = readSrc("src/workspaces/library/vouchers/VoucherForm.tsx");
assert.match(form, /name="redemption_limit"/);
assert.match(form, /Leave blank for unlimited/);

const directory = readSrc("src/workspaces/library/vouchers/VoucherDirectory.tsx");
assert.match(directory, /Redemption limit: Unlimited/);
assert.match(directory, /Limit \$\{voucher.redemptionLimit\}/);

const detail = readSrc("src/app/(app)/library/vouchers/[id]/page.tsx");
assert.match(detail, /CatalogueVoucherRedemptionHistory/);
assert.match(detail, /canManage \?/);
assert.match(detail, /Remaining/);

const history = readSrc(
  "src/workspaces/library/vouchers/CatalogueVoucherRedemptionHistory.tsx",
);
assert.match(history, /\/owner\/orders\/\$\{event.orderId\}/);
assert.match(history, /Order cancelled/);
assert.match(history, /Newest first/);

const actions = readSrc("src/workspaces/library/vouchers/actions.ts");
assert.match(actions, /redemption_limit: parsed.redemptionLimit/);

const cancel = readSrc("supabase/migrations/20260910120000_post_payment_customer_change_guard.sql");
assert.match(cancel, /create or replace function public.cancel_guest_order/);
assert.doesNotMatch(
  readSrc("supabase/migrations/20260926120000_catalogue_voucher_redemption_controls.sql"),
  /create or replace function public.cancel_guest_order/,
);

console.log("PASS catalogue voucher redemption controls");
