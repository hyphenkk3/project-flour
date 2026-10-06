/** Contract coverage for the atomic Owner-only paid Fresh Pick cancellation. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20261003114013_owner_cancel_refund_fresh_pick.sql",
  "utf8",
);
const orderActions = readFileSync(
  "src/workspaces/owner/orders/actions.ts",
  "utf8",
);
const lifecycleUi = readFileSync(
  "src/workspaces/owner/orders/OrderLifecycleActions.tsx",
  "utf8",
);
const paymentSection = readFileSync(
  "src/workspaces/owner/orders/PaymentSection.tsx",
  "utf8",
);
const paymentRequestPreview = readFileSync(
  "src/workspaces/owner/orders/PaymentRequestPreview.tsx",
  "utf8",
);
const paymentCorrectionTest = readFileSync(
  "scripts/test-payment-correction.ts",
  "utf8",
);

const genericWrapper = migration.match(
  /create function public\.cancel_guest_order\([\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(genericWrapper, "generic cancellation guard is installed");
assert.match(
  genericWrapper,
  /order_row\.status = 'paid'[\s\S]*?extra_stock_id is not null/,
);
assert.match(genericWrapper, /Paid Fresh Picks must use the Owner-only/);
assert.ok(
  genericWrapper.indexOf("raise exception") <
    genericWrapper.indexOf("_cancel_guest_order_before_paid_fresh_pick_refund"),
  "generic cancellation rejects paid Fresh Picks before reaching the previous implementation",
);
assert.match(orderActions, /order\.status === "paid" && order\.extraStockId/);

const dedicatedRpc = migration.match(
  /create or replace function public\.cancel_and_refund_paid_fresh_pick\([\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(dedicatedRpc, "dedicated paid Fresh Pick transaction exists");
assert.match(dedicatedRpc, /_bind_rpc_actor\(p_actor_staff_id\)/);
assert.match(dedicatedRpc, /array\['owner'\]::text\[\]/);
assert.doesNotMatch(
  dedicatedRpc,
  /array\[[^\]]*(manager|bakery|customer_operations)/,
);
assert.match(orderActions, /staff\.role\.code !== "owner"/);
assert.match(
  lifecycleUi,
  /capabilities\.role === "owner" &&\s+isPaidFreshPick\s+&&\s+order\.settlement\.netReceived > 0/,
);
assert.match(lifecycleUi, /Cancel &amp; Record Refund/);
assert.match(lifecycleUi, /order\.settlement\.netReceived > 0/);
assert.match(lifecycleUi, /Project Flour does not transfer money/);
assert.match(lifecycleUi, /already been returned to the customer/);
assert.match(lifecycleUi, /Reason/);

assert.match(dedicatedRpc, /where o\.id = p_order_id[\s\S]*?for update/);
assert.match(dedicatedRpc, /v_order\.status <> 'paid'/);
assert.match(dedicatedRpc, /v_order\.payment_status <> 'paid'/);
assert.match(dedicatedRpc, /v_order\.extra_stock_id is null/);
for (const handoffField of [
  "out_for_delivery_at",
  "picked_up_at",
  "delivered_at",
]) {
  assert.match(
    dedicatedRpc,
    new RegExp(`v_order\\.${handoffField} is not null`),
  );
}
assert.doesNotMatch(dedicatedRpc, /v_order\.ready_at\s+is\s+not\s+null/);
assert.match(dedicatedRpc, /order is already cancelled/i);

assert.match(dedicatedRpc, /preorder_submitted/);
assert.match(dedicatedRpc, /extra_stock_ids/);
assert.match(dedicatedRpc, /jsonb_array_elements_text/);
assert.match(dedicatedRpc, /item_count/);
assert.match(dedicatedRpc, /legacy single-item orders/i);
assert.match(dedicatedRpc, /array\[v_order\.extra_stock_id\]/);
assert.match(dedicatedRpc, /for update of e/);
assert.match(dedicatedRpc, /order by e\.id[\s\S]*?for update of e/);
assert.match(dedicatedRpc, /v_linked_ids is distinct from v_expected_sorted/);
assert.match(dedicatedRpc, /v_stock\.id = any\(v_expected_sorted\)/);
assert.match(dedicatedRpc, /v_stock\.order_id is distinct from v_order\.id/);
assert.match(dedicatedRpc, /v_stock\.lifecycle is distinct from 'confirmed'/);
assert.match(dedicatedRpc, /v_stock\.sold_at is null/);
assert.match(dedicatedRpc, /v_stock\.cut_into_slices_at is not null/);
assert.match(dedicatedRpc, /unexpected Fresh Pick is linked to this order/);

assert.match(dedicatedRpc, /order_verified_allocated\(v_order\.id\) <= 0/);
assert.match(
  dedicatedRpc,
  /v_refund_amount := public\.order_net_received\(v_order\.id\)/,
);
assert.match(dedicatedRpc, /'fresh_pick_cancellation'/);
assert.match(dedicatedRpc, /remaining cash amount/);
assert.match(dedicatedRpc, /public\.order_net_received\(v_order\.id\) <> 0/);
assert.doesNotMatch(
  dedicatedRpc,
  /update public\.payments|delete from public\.payments/,
);
assert.doesNotMatch(
  dedicatedRpc,
  /library_cake_sizes|scheduled_price|cake_size_price/,
);

const stockRelease = dedicatedRpc.match(
  /update public\.extra_stock e[\s\S]*?get diagnostics v_rows = row_count;/,
)?.[0];
assert.ok(stockRelease, "physical stock release is explicit");
assert.match(stockRelease, /set order_id = null,[\s\S]*?sold_at = null/);
assert.match(stockRelease, /walk_in_held_until = null/);
assert.match(stockRelease, /walk_in_held_by = null/);
assert.match(stockRelease, /where e\.id = v_stock\.id/);
assert.match(stockRelease, /and e\.order_id = v_order\.id/);
assert.match(stockRelease, /and e\.lifecycle = 'confirmed'/);
assert.match(stockRelease, /and e\.cut_into_slices_at is null/);
assert.doesNotMatch(stockRelease, /ready_for_collection\s*=/);
assert.match(dedicatedRpc, /ready_for_collection_preserved/);
assert.match(dedicatedRpc, /physical_stock_snapshot/);
assert.match(dedicatedRpc, /released_extra_stock_ids/);
assert.match(dedicatedRpc, /v_ready_after is distinct from/);
assert.match(
  dedicatedRpc,
  /catalogue_voucher_redemptions r[\s\S]*?r\.status = 'redeemed'/,
);
assert.match(dedicatedRpc, /_record_extra_stock_event\([\s\S]*?'released'/);
assert.match(
  dedicatedRpc,
  /event_type,[\s\S]*?'fresh_pick_cancelled_refunded'/,
);
assert.match(dedicatedRpc, /'payment_snapshot', v_payment_snapshot/);
assert.match(dedicatedRpc, /'refund_amount', v_refund_amount/);
assert.match(dedicatedRpc, /'reason', v_reason/);
assert.match(dedicatedRpc, /'ready_at_preserved', v_order\.ready_at/);
assert.doesNotMatch(dedicatedRpc, /ready_for_collection_(?:marked|undone)/);

// A raised exception aborts all writes in this function call, including the
// refund, every released row/event, cancellation, and trigger-based voucher release.
assert.doesNotMatch(dedicatedRpc, /exception\s+when/i);
assert.ok(
  dedicatedRpc.indexOf("insert into public.refunds") <
    dedicatedRpc.indexOf("update public.extra_stock"),
);
assert.ok(
  dedicatedRpc.indexOf("update public.extra_stock") <
    dedicatedRpc.indexOf("update public.orders"),
);
assert.ok(
  dedicatedRpc.indexOf("update public.orders") <
    dedicatedRpc.indexOf("insert into public.order_timeline_events"),
);
assert.doesNotMatch(migration, /drop trigger[^;]*catalogue_voucher/i);

assert.match(
  paymentSection,
  /order\.status !== "cancelled"[\s\S]*?hasVerifiedPaymentForPaymentThankYou/,
);
assert.match(
  paymentRequestPreview,
  /if \(order\.status === "cancelled"\)[\s\S]*?Cancelled orders cannot receive payment requests/,
);
assert.match(
  paymentRequestPreview,
  /order\.status !== "cancelled" &&\s+method === "wb_qr"/,
);
assert.match(
  paymentRequestPreview,
  /if \(order\.status !== "awaiting_payment"\) return/,
);

// Existing overpayment corrections retain their original amount/role contract.
assert.match(migration, /NEW\.refund_type <> 'overpayment_correction'/);
assert.match(migration, /NEW\.amount > v_remaining/);
assert.match(paymentCorrectionTest, /owner\.canRecordPaymentCorrection, true/);
assert.match(
  paymentCorrectionTest,
  /manager\.canRecordPaymentCorrection, true/,
);
assert.match(
  paymentCorrectionTest,
  /counter\.canRecordPaymentCorrection, false/,
);

console.log("PASS Paid Fresh Pick cancel/refund contract");
