/**
 * EXTRA Activation v1 — availability + capabilities (no DB).
 * Run: npx tsx scripts/test-extra-capabilities-availability.ts
 */
import assert from "node:assert/strict";
import {
  isExtraAvailable,
  isExtraExpiredConfirmed,
} from "@/engines/extra/availability";
import { buildExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";
import { canAccessBakeryWorkspace } from "@/engines/bakery/capabilities";
import { normalizeExtraRejectReason } from "@/engines/extra/reject-reason";
import {
  buildCollectionWorkspaceCapabilities,
  canAccessCollectionWorkspace,
} from "@/engines/collection/capabilities";

const through = "2026-08-15T15:00:00.000Z";

assert.equal(
  isExtraAvailable({
    lifecycle: "confirmed",
    pickupThroughAt: through,
    now: new Date("2026-08-15T15:00:00.000Z"),
  }),
  true,
  "inclusive: now === pickup_through_at is still available",
);

assert.equal(
  isExtraAvailable({
    lifecycle: "confirmed",
    pickupThroughAt: through,
    now: new Date("2026-08-15T15:00:00.001Z"),
  }),
  false,
  "1ms after pickup_through_at is unavailable",
);

assert.equal(
  isExtraAvailable({
    lifecycle: "proposed",
    pickupThroughAt: through,
    now: new Date("2026-08-15T14:00:00.000Z"),
  }),
  false,
  "proposed is never available",
);

assert.equal(
  isExtraAvailable({
    lifecycle: "rejected",
    pickupThroughAt: through,
    now: new Date("2026-08-15T14:00:00.000Z"),
  }),
  false,
  "rejected is never available",
);

assert.equal(
  isExtraExpiredConfirmed({
    lifecycle: "confirmed",
    pickupThroughAt: through,
    now: new Date("2026-08-15T16:00:00.000Z"),
  }),
  true,
);

assert.equal(normalizeExtraRejectReason(null), null);
assert.equal(normalizeExtraRejectReason(""), null);
assert.equal(normalizeExtraRejectReason("   "), null);
assert.equal(normalizeExtraRejectReason(" not physical "), "not physical");

for (const role of ["bakery", "manager", "owner"] as const) {
  const caps = buildExtraWorkspaceCapabilities({
    role,
    staffId: `${role}-1`,
  });
  assert.equal(caps.canAccessExtraSurface, true, `${role} EXTRA access`);
  assert.equal(caps.canProposeExtra, true, `${role} propose`);
  assert.equal(caps.canConfirmExtra, true, `${role} confirm`);
  assert.equal(caps.canRejectExtra, true, `${role} reject`);
  assert.equal(caps.canUndoRejectExtra, true, `${role} undo reject`);
  assert.equal(caps.canCreateConfirmedExtra, true, `${role} create confirmed`);
  assert.equal(canAccessBakeryWorkspace(role), true);
}

for (const role of ["collection", "customer_operations"] as const) {
  const caps = buildExtraWorkspaceCapabilities({
    role,
    staffId: `${role}-1`,
  });
  assert.equal(caps.canAccessExtraSurface, false, `${role} no EXTRA access`);
  assert.equal(caps.canProposeExtra, false);
  assert.equal(caps.canConfirmExtra, false);
  assert.equal(caps.canRejectExtra, false);
  assert.equal(caps.canUndoRejectExtra, false);
  assert.equal(caps.canCreateConfirmedExtra, false);
}

// Collection / Bakery gates unchanged.
assert.equal(canAccessCollectionWorkspace("collection"), true);
assert.equal(canAccessCollectionWorkspace("bakery"), false);
assert.equal(
  buildCollectionWorkspaceCapabilities({
    role: "bakery",
    staffId: "b1",
  }).canMarkCollected,
  false,
);

console.log("EXTRA capabilities + availability: PASS");
