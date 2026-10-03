import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(path), "utf8");
const migration = read(
  "supabase/migrations/20261001093506_walk_in_sale_physical_rm10_voucher.sql",
);
const rm10Migration = read(
  "supabase/migrations/20260924180000_authoritative_library_rm10_expiry.sql",
);
const dialog = read("src/workspaces/extra/WalkInHoldCompleteSaleDialog.tsx");
const actions = read("src/workspaces/extra/actions.ts");

assert.match(
  migration,
  /begin;[\s\S]*?drop function if exists public\.complete_extra_stock_walk_in_sale/,
);
assert.match(
  migration,
  /p_physical_rm10_voucher_number text default null,[\s\S]*?p_physical_rm10_expiry_date date default null,[\s\S]*?p_rm10_owner_override boolean default false,[\s\S]*?p_rm10_override_reason text default null/,
);
assert.match(
  migration,
  /Cannot stack with an RM10 Discount Card on the same order/,
);
assert.match(migration, /redeem_rm10_physical_voucher_for_guest_order\(/);
assert.doesNotMatch(
  migration,
  /insert into public\.physical_discount_vouchers|insert into public\.physical_discount_voucher_redemptions/,
);

const orderItemAt = migration.indexOf("insert into public.order_items");
const extraLinkAt = migration.indexOf("set order_id = new_order.id");
const catalogueAt = migration.indexOf(
  "apply_catalogue_voucher_to_guest_order(",
);
const physicalAt = migration.indexOf(
  "redeem_rm10_physical_voucher_for_guest_order(",
);
const amountDueAt = migration.indexOf("v_remaining := public.order_amount_due");
const paymentAt = migration.indexOf("record_and_verify_guest_order_payment(");
assert.ok(orderItemAt >= 0 && orderItemAt < physicalAt);
assert.ok(extraLinkAt > orderItemAt && extraLinkAt < physicalAt);
assert.ok(catalogueAt < physicalAt);
assert.ok(physicalAt < amountDueAt && amountDueAt < paymentAt);
assert.match(migration, /security definer[\s\S]*?set search_path = public/);
assert.doesNotMatch(migration, /exception\s+when/i);

assert.match(
  rm10Migration,
  /order_row\.status not in \([\s\S]*?'awaiting_payment'[\s\S]*?'paid'/,
);
assert.match(
  rm10Migration,
  /guest_order_has_adjustment_code\(p_order_id, c_code\)/,
);
assert.match(
  rm10Migration,
  /guest_order_has_adjustment_code\(p_order_id, 'august_promo_2026'\)/,
);
assert.match(rm10Migration, /guest_order_has_eligible_rm10_size\(p_order_id\)/);
assert.match(
  rm10Migration,
  /from public\.physical_discount_vouchers v[\s\S]*?for update/,
);
assert.match(rm10Migration, /voucher_row\.status = 'redeemed'/);
assert.match(
  rm10Migration,
  /insert into public\.physical_discount_voucher_redemptions/,
);
assert.match(rm10Migration, /set\s+status = 'redeemed'/);
assert.match(
  rm10Migration,
  /This voucher cannot be redeemed again \(duplicate protection\)/,
);

assert.match(dialog, /Catalogue voucher/);
assert.match(dialog, /Physical RM10 voucher/);
assert.match(dialog, /Voucher number/);
assert.match(dialog, /Expiry date/);
assert.match(dialog, /Apply RM10 voucher/);
assert.match(dialog, /verified[\s\S]*?confirm the sale/);
assert.match(dialog, /physicalVoucherApplied \? 10 : 0/);
assert.match(
  dialog,
  /Catalogue vouchers cannot be stacked with an RM10 Discount Card/,
);
assert.match(dialog, /preview\.canOverridePhysicalRm10/);
assert.match(dialog, /physicalRm10VoucherNumber:/);
assert.match(dialog, /rm10OwnerOverride:/);

assert.match(
  actions,
  /p_physical_rm10_voucher_number: physicalRm10VoucherNumber/,
);
assert.match(actions, /p_physical_rm10_expiry_date: physicalRm10ExpiryDate/);
assert.match(actions, /p_rm10_owner_override: rm10OwnerOverride/);
assert.match(actions, /p_rm10_override_reason: rm10OverrideReason/);
assert.match(
  actions,
  /canOverridePhysicalRm10:[\s\S]*?staff\.role\.code === "manager"/,
);

console.log("Walk-in physical RM10 transaction contracts passed.");
