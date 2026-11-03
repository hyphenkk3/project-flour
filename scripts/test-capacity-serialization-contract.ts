import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(path), "utf8");
const migration = read(
  "supabase/migrations/20261103140120_serialize_guest_preorder_capacity.sql",
);
const lockConflictMigration = read(
  "supabase/migrations/20261103140631_capacity_row_lock_conflict.sql",
);
const checkout = read("supabase/migrations/20260902230000_phase3_preorder_date_engine.sql");
const ownerCreate = read("supabase/migrations/20261011100225_staff_creation_rpc_actor_authorization.sql");
const capacityRead = read("src/workspaces/storefront/checkout/capacity-availability.ts");

assert.match(migration, /pg_advisory_xact_lock\s*\(\s*1463951427\s*,/);
assert.match(migration, /create or replace function public\._guest_preorder_item_fully_booked/);
assert.match(migration, /_guest_preorder_item_fully_booked[\s\S]*?language plpgsql\s+volatile/);
assert.match(migration, /set_production_capacity[\s\S]*?_lock_production_capacity_date\(p_pickup_date\)[\s\S]*?pg_advisory_xact_lock/);
assert.match(migration, /_lock_production_capacity_date\(p_pickup_date\)[\s\S]*?from public\.production_capacity/);
assert.match(migration, /production_capacity_holds[\s\S]*?held_until > now\(\)/);
assert.match(migration, /create trigger lock_production_capacity_orders[\s\S]*?on public\.orders/);
assert.match(migration, /create trigger lock_production_capacity_order_items[\s\S]*?on public\.order_items/);
assert.match(migration, /create trigger lock_production_capacity_definitions[\s\S]*?on public\.production_capacity/);
assert.match(migration, /create trigger lock_production_capacity_holds[\s\S]*?on public\.production_capacity_holds/);
assert.match(migration, /create constraint trigger assert_production_capacity_orders[\s\S]*?deferrable initially deferred/);
assert.match(migration, /create constraint trigger assert_production_capacity_order_items[\s\S]*?deferrable initially deferred/);
assert.match(migration, /create constraint trigger assert_production_capacity_definitions[\s\S]*?deferrable initially deferred/);
assert.match(migration, /create constraint trigger assert_production_capacity_holds[\s\S]*?deferrable initially deferred/);
assert.match(migration, /o\.extra_stock_id is null/);
assert.match(migration, /revoke all on function public\._lock_production_capacity_date\(date\)[\s\S]*?from public, anon, authenticated, service_role/);
assert.match(lockConflictMigration, /pg_try_advisory_xact_lock/);
assert.match(lockConflictMigration, /errcode = ''40001''/);
assert.match(lockConflictMigration, /md5\(pg_catalog\.pg_get_functiondef/);
assert.match(lockConflictMigration, /public\._try_lock_production_capacity_date\(/);
assert.match(lockConflictMigration, /position\(v_lock_call in v_definition\) > 0/);
assert.match(checkout, /if public\._guest_preorder_item_fully_booked\(/);
assert.match(ownerCreate, /insert into public\.orders\s*\(/i);
assert.match(ownerCreate, /insert into public\.order_items\s*\(/i);
assert.match(capacityRead, /availabilityConfirmed/);
assert.match(capacityRead, /classifyCapacityLookupError/);
assert.doesNotMatch(capacityRead, /grant\s+select\s+on\s+public\.production_capacity\s+to\s+anon/i);

console.log("PASS capacity serialization migration contract");
