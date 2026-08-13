/**
 * M5-P1 — Bakery access capability matrix (no DB).
 * Run: npx tsx scripts/test-m5-p1-bakery-capabilities-ux.ts
 */
import assert from "node:assert/strict";
import {
  buildBakeryWorkspaceCapabilities,
  canAccessBakeryWorkspace,
} from "@/engines/bakery/capabilities";
import { canAccessGuestOrderWorkspace } from "@/engines/orders/delivery-finance-capabilities";
import { canAccessWorkspace } from "@/foundation/navigation/access";
import { getNavigationForRole } from "@/foundation/navigation/workspaces";

assert.equal(canAccessBakeryWorkspace("bakery"), true);
assert.equal(canAccessBakeryWorkspace("manager"), true);
assert.equal(canAccessBakeryWorkspace("owner"), true);
assert.equal(canAccessBakeryWorkspace("customer_operations"), false);
assert.equal(canAccessBakeryWorkspace("collection"), false);

for (const role of ["bakery", "manager", "owner"] as const) {
  const caps = buildBakeryWorkspaceCapabilities({
    role,
    staffId: `${role}-1`,
  });
  assert.equal(caps.canAccessBakeryWorkspace, true);
  assert.equal(caps.canStartProduction, true, `${role} Start true in P2`);
  assert.equal(caps.canUndoStart, true);
  assert.equal(caps.canMarkReady, false, `${role} Mark Ready still P3`);
  assert.equal(caps.canUndoReady, false);
}

const denied = buildBakeryWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "co-1",
});
assert.equal(denied.canAccessBakeryWorkspace, false);
assert.equal(denied.canStartProduction, false);
assert.equal(denied.canUndoStart, false);

// Owner Ops matrix unchanged for bakery role.
assert.equal(canAccessGuestOrderWorkspace("bakery"), false);
assert.equal(canAccessGuestOrderWorkspace("owner"), true);

assert.equal(canAccessWorkspace("owner", "bakery"), true);
assert.equal(canAccessWorkspace("bakery", "bakery"), true);
assert.equal(canAccessWorkspace("manager", "bakery"), true);
assert.equal(canAccessWorkspace("customer_operations", "bakery"), false);

const ownerNav = getNavigationForRole("owner");
assert.ok(
  ownerNav.some((item) => item.id === "bakery" && item.href === "/bakery"),
  "Owner nav includes Bakery",
);

const bakeryNav = getNavigationForRole("bakery");
assert.ok(bakeryNav.some((item) => item.id === "bakery"));

const coNav = getNavigationForRole("customer_operations");
assert.ok(!coNav.some((item) => item.id === "bakery"));

console.log("PASS M5-P1 bakery capabilities / nav");
