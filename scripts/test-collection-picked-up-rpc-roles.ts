/**
 * Collection Picked Up RPC allowlist (source) — Shared Operations CO widen.
 * Run: npx tsx scripts/test-collection-picked-up-rpc-roles.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCollectionWorkspaceCapabilities,
  canAccessCollectionWorkspace,
} from "@/engines/collection/capabilities";

const migration = readFileSync(
  resolve(
    "supabase/migrations/20260814140000_collection_customer_operations_picked_up.sql",
  ),
  "utf8",
);

const allowlist =
  /v_role not in \('owner', 'manager', 'collection', 'customer_operations'\)/g;
const matches = migration.match(allowlist);
assert.equal(
  matches?.length,
  2,
  "mark + undo RPCs must both allow customer_operations",
);

assert.match(migration, /mark_guest_order_picked_up/);
assert.match(migration, /undo_guest_order_picked_up/);
assert.doesNotMatch(migration, /'bakery'/);
assert.doesNotMatch(migration, /create table/i);
assert.doesNotMatch(migration, /alter table/i);

for (const role of [
  "owner",
  "manager",
  "collection",
  "customer_operations",
] as const) {
  assert.equal(canAccessCollectionWorkspace(role), true, role);
  const caps = buildCollectionWorkspaceCapabilities({
    role,
    staffId: `${role}-1`,
  });
  assert.equal(caps.canMarkCollected, true, `${role} mark`);
  assert.equal(caps.canUndoCollected, true, `${role} undo`);
}

assert.equal(canAccessCollectionWorkspace("bakery"), false);
const bakery = buildCollectionWorkspaceCapabilities({
  role: "bakery",
  staffId: "bakery-1",
});
assert.equal(bakery.canMarkCollected, false);
assert.equal(bakery.canUndoCollected, false);

console.log("PASS Collection Picked Up RPC roles (source)");
