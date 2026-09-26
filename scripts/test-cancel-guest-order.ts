/**
 * Canonical guest-order cancellation RPC + Owner workspace wiring.
 * Run: npx tsx scripts/test-cancel-guest-order.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const restore = readSrc(
  "supabase/migrations/20260926140000_restore_cancel_guest_order_override.sql",
);
assert.match(
  restore,
  /create or replace function public\.cancel_guest_order\(/,
);
assert.match(restore, /p_order_id uuid/);
assert.match(restore, /p_actor_staff_id uuid/);
assert.match(restore, /p_override boolean default false/);
assert.match(restore, /drop function if exists public\.cancel_guest_order\(uuid, uuid\)/);
assert.match(restore, /Not authorized to cancel this order/);
assert.match(restore, /status = 'cancelled'/);
assert.match(restore, /'order_cancelled'/);
assert.match(restore, /orders_release_catalogue_voucher_on_cancel|Catalogue voucher release stays on the cancel trigger/);
assert.doesNotMatch(restore, /release_catalogue_voucher_redemptions_for_order\(/);
assert.doesNotMatch(restore, /physical_discount_vouchers|august_promo_2026/);

const canonical = readSrc(
  "supabase/migrations/20260910120000_post_payment_customer_change_guard.sql",
);
assert.match(
  canonical,
  /create or replace function public\.cancel_guest_order\(\s*p_order_id uuid,\s*p_actor_staff_id uuid,\s*p_override boolean default false/,
);

const actions = readSrc("src/workspaces/owner/orders/actions.ts");
const cancelAction = actions.slice(
  actions.indexOf("export async function cancelGuestOrderAction"),
);
assert.match(cancelAction, /rpc\("cancel_guest_order"/);
assert.match(cancelAction, /p_order_id: orderId/);
assert.match(cancelAction, /p_actor_staff_id: staff\.id/);
assert.match(cancelAction, /p_override: override/);
assert.match(cancelAction, /requireOwnerOrCustomerOperations/);
assert.match(cancelAction, /canCancelGuestOrder/);
assert.match(cancelAction, /decidePostPaymentCancel/);

const redemption = readSrc(
  "supabase/migrations/20260926120000_catalogue_voucher_redemption_controls.sql",
);
assert.match(redemption, /orders_release_catalogue_voucher_on_cancel/);
assert.match(redemption, /when \(new\.status = 'cancelled'/);
assert.doesNotMatch(redemption, /create or replace function public\.cancel_guest_order/);

console.log("PASS cancel guest order rpc contract");
