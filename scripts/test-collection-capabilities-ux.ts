/**
 * Live Collection — capabilities / nav (no DB).
 * Run: npx tsx scripts/test-collection-capabilities-ux.ts
 */
import assert from "node:assert/strict";
import {
  buildCollectionWorkspaceCapabilities,
  canAccessCollectionWorkspace,
} from "@/engines/collection/capabilities";
import { canAccessBakeryWorkspace } from "@/engines/bakery/capabilities";
import { buildGuestOrderWorkspaceCapabilities } from "@/engines/orders/delivery-finance-capabilities";
import { canAccessWorkspace } from "@/foundation/navigation/access";
import { getNavigationForRole } from "@/foundation/navigation/workspaces";

assert.equal(canAccessCollectionWorkspace("collection"), true);
assert.equal(canAccessCollectionWorkspace("manager"), true);
assert.equal(canAccessCollectionWorkspace("owner"), true);
assert.equal(canAccessCollectionWorkspace("bakery"), false);
assert.equal(canAccessCollectionWorkspace("customer_operations"), true);

for (const role of [
  "collection",
  "manager",
  "owner",
  "customer_operations",
] as const) {
  const caps = buildCollectionWorkspaceCapabilities({
    role,
    staffId: `${role}-1`,
  });
  assert.equal(caps.canAccessCollectionWorkspace, true);
  assert.equal(caps.canMarkCollected, true, `${role} Mark Collected`);
  assert.equal(caps.canUndoCollected, true, `${role} Undo Collected`);
}

const bakeryDenied = buildCollectionWorkspaceCapabilities({
  role: "bakery",
  staffId: "bakery-1",
});
assert.equal(bakeryDenied.canAccessCollectionWorkspace, false);
assert.equal(bakeryDenied.canMarkCollected, false);
assert.equal(bakeryDenied.canUndoCollected, false);

// Owner Ops Collection controls: Owner + Manager + Customer Operations.
assert.equal(
  buildGuestOrderWorkspaceCapabilities({ role: "owner", staffId: "o1" })
    .canOperateCollectionControls,
  true,
);
assert.equal(
  buildGuestOrderWorkspaceCapabilities({ role: "manager", staffId: "m1" })
    .canOperateCollectionControls,
  true,
);
assert.equal(
  buildGuestOrderWorkspaceCapabilities({
    role: "customer_operations",
    staffId: "co1",
  }).canOperateCollectionControls,
  true,
);
assert.equal(
  buildGuestOrderWorkspaceCapabilities({ role: "collection", staffId: "c1" })
    .canOperateCollectionControls,
  false,
);

// Bakery access unchanged.
assert.equal(canAccessBakeryWorkspace("bakery"), true);
assert.equal(canAccessBakeryWorkspace("collection"), false);

assert.equal(canAccessWorkspace("owner", "collection"), true);
assert.equal(canAccessWorkspace("manager", "collection"), true);
assert.equal(canAccessWorkspace("collection", "collection"), true);
assert.equal(canAccessWorkspace("bakery", "collection"), false);
assert.equal(canAccessWorkspace("customer_operations", "collection"), true);

const ownerNav = getNavigationForRole("owner");
assert.ok(
  ownerNav.some(
    (item) => item.id === "collection" && item.href === "/collection",
  ),
  "Owner nav includes Collection",
);
assert.ok(ownerNav.some((item) => item.id === "bakery"));

const collectionNav = getNavigationForRole("collection");
assert.ok(
  collectionNav.some(
    (item) => item.id === "collection" && item.href === "/collection",
  ),
);
assert.ok(!collectionNav.some((item) => item.id === "bakery"));

const bakeryNav = getNavigationForRole("bakery");
assert.ok(!bakeryNav.some((item) => item.id === "collection"));

const coNav = getNavigationForRole("customer_operations");
assert.ok(
  coNav.some((item) => item.id === "collection"),
  "CO must see Collection nav",
);
assert.ok(!coNav.some((item) => item.id === "bakery"));

console.log("PASS Collection capabilities / nav");
