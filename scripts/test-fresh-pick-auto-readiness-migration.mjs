import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20261030152116_fresh_pick_auto_readiness_all_fulfilments.sql",
  "utf8",
);

const sync = migration.match(
  /create or replace function public\._sync_fresh_pick_order_readiness_unheld_impl\([\s\S]*?\n\$\$;/i,
)?.[0];
assert.ok(sync, "existing unheld Fresh Pick readiness implementation is extended");
assert.match(sync, /fulfilment_method in \('pickup', 'delivery', 'dine_in'\)/);
assert.match(sync, /order_source is distinct from 'customer_website'/);
assert.match(sync, /order_row\.production_started_at is null/);
assert.match(sync, /_fresh_pick_order_is_fully_paid\(p_order_id\)/);
assert.match(sync, /_fresh_pick_order_items_are_ready\(p_order_id\)/);
assert.match(sync, /ready_at is null/);
assert.match(sync, /event_type, actor_staff_id, metadata/);
assert.match(sync, /'order_marked_ready'/);
assert.match(sync, /'order_ready_undone'/);
assert.match(sync, /'fresh_pick_readiness_reconciliation'/);

for (const fnName of [
  "mark_extra_stock_ready_for_collection",
  "undo_extra_stock_ready_for_collection",
]) {
  const fn = migration.match(
    new RegExp(`create or replace function public\\.${fnName}\\([\\s\\S]*?\\$function\\$;`, "i"),
  )?.[0];
  assert.ok(fn, `${fnName} retains the existing RPC signature`);
  assert.match(fn, /_bind_rpc_actor\(p_actor_staff_id\)/);
  assert.match(fn, /_require_rpc_roles\([\s\S]*array\['bakery', 'manager', 'owner'\]/);
  assert.match(fn, /from public\.extra_stock e[\s\S]*?for update/);
  assert.match(fn, /fulfilment_method in \('pickup', 'dine_in'\)[\s\S]*fulfilment_method = 'delivery'[\s\S]*order_source = 'customer_website'/);
  assert.match(fn, /picked_up_at is null[\s\S]*out_for_delivery_at is null[\s\S]*delivered_at is null/);
  assert.match(fn, /_record_extra_stock_event/);
}

assert.doesNotMatch(migration, /production_started_at\s*:=|set\s+production_started_at/i);
assert.doesNotMatch(migration, /create table|alter table|drop table|delete from public\./i);
assert.match(migration, /No rows are rewritten/);

console.log(
  "PASS Fresh Pick automatic readiness migration contract: all fulfilments, exact-payment and allocation guards, no started production, authorized physical readiness, undo, lifecycle, audit, no data rewrite",
);
