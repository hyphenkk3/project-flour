/**
 * Collection derived Pickup overdue attention (no DB, no mutations).
 * Run: npx tsx scripts/test-collection-pickup-overdue.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectionSingaporeWallClock } from "@/workspaces/collection/date";
import {
  COLLECTION_PICKUP_OVERDUE_LABEL,
  collectionDeskAttention,
  collectionDeskPresentation,
  countCollectionPickupOverdue,
  isCollectionPickupOverdue,
} from "@/workspaces/collection/eligibility";

/** Interpret YYYY-MM-DD HH:MM[:SS] as Asia/Singapore (UTC+8, no DST). */
function singaporeInstant(ymd: string, hms: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  const [hour, minute, second] = hms.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second ?? 0));
}

const READY = "2026-08-16T01:00:00.000Z";

function overdue(partial: {
  pickupDate?: string;
  pickupTime?: string;
  pickedUpAt?: string | null;
  readyAt?: string | null;
  now: Date;
}): boolean {
  return isCollectionPickupOverdue({
    pickupDate: partial.pickupDate ?? "2026-08-16",
    pickupTime: partial.pickupTime ?? "15:00:00",
    pickedUpAt: partial.pickedUpAt ?? null,
    readyAt: partial.readyAt === undefined ? READY : partial.readyAt,
    now: partial.now,
  });
}

const now16at1500 = singaporeInstant("2026-08-16", "15:00:00");
const now16at1459 = singaporeInstant("2026-08-16", "14:59:00");
const now16at1501 = singaporeInstant("2026-08-16", "15:01:00");
const now16at1159 = singaporeInstant("2026-08-16", "11:59:00");
const now16at1200 = singaporeInstant("2026-08-16", "12:00:00");

{
  const clock = collectionSingaporeWallClock(now16at1500);
  assert.equal(clock.ymd, "2026-08-16");
  assert.equal(clock.hour, 15);
  assert.equal(clock.minute, 0);
}

assert.equal(
  overdue({
    pickupDate: "2026-08-17",
    pickupTime: "15:00:00",
    now: now16at1500,
  }),
  false,
  "1. pickup tomorrow is not overdue",
);

assert.equal(
  overdue({
    pickupDate: "2026-08-16",
    pickupTime: "16:00:00",
    now: now16at1500,
  }),
  false,
  "2. pickup later today is not overdue",
);

assert.equal(
  overdue({
    pickupDate: "2026-08-16",
    pickupTime: "15:00:00",
    now: now16at1500,
  }),
  true,
  "3. pickup exactly at current datetime is overdue",
);

assert.equal(
  overdue({
    pickupDate: "2026-08-16",
    pickupTime: "15:00:00",
    now: now16at1501,
  }),
  true,
  "4. pickup one minute in the past is overdue",
);

assert.equal(
  overdue({
    pickupDate: "2026-08-15",
    pickupTime: "15:00:00",
    now: now16at1500,
  }),
  true,
  "5. pickup yesterday is overdue",
);

assert.equal(
  overdue({
    pickupDate: "2026-08-15",
    pickupTime: "15:00:00",
    pickedUpAt: "2026-08-15T08:00:00.000Z",
    now: now16at1500,
  }),
  false,
  "6. already collected is not overdue",
);

assert.equal(
  overdue({
    pickupDate: "2026-08-16",
    pickupTime: "18:00:00",
    now: now16at1500,
  }),
  false,
  "7. Ready + future pickup is not overdue",
);

assert.equal(
  overdue({
    pickupDate: "2026-08-16",
    pickupTime: "12:00:00",
    now: now16at1159,
  }),
  false,
  "9a. 16 Aug 12:00 at 11:59 SGT is not overdue",
);
assert.equal(
  overdue({
    pickupDate: "2026-08-16",
    pickupTime: "12:00:00",
    now: now16at1200,
  }),
  true,
  "9b. 16 Aug 12:00 at 12:00 SGT is overdue",
);

assert.equal(
  overdue({
    pickupTime: "15:00:00",
    now: now16at1459,
  }),
  false,
  "pickup time matters: 14:59 is not overdue",
);

assert.equal(
  overdue({
    readyAt: null,
    pickupDate: "2026-08-15",
    now: now16at1500,
  }),
  false,
  "not Ready is not overdue",
);

{
  const input = {
    pickupDate: "2026-08-16",
    pickupTime: "15:00:00",
    pickedUpAt: null as string | null,
    readyAt: READY,
    now: now16at1500,
  };
  Object.freeze(input);
  assert.equal(isCollectionPickupOverdue(input), true);
  assert.equal(input.pickedUpAt, null);
  assert.equal(input.readyAt, READY);
}

{
  const attention = collectionDeskAttention({
    readyAt: READY,
    pickedUpAt: null,
    fulfilmentMethod: "pickup",
    pickupDate: "2026-08-16",
    pickupTime: "15:00:00",
    now: now16at1500,
  });
  assert.equal(attention.label, COLLECTION_PICKUP_OVERDUE_LABEL);
  assert.equal(attention.tone, "warning");
  assert.equal(attention.overdue, true);
  assert.equal(
    collectionDeskPresentation({
      readyAt: READY,
      pickedUpAt: null,
      fulfilmentMethod: "pickup",
    }),
    "ready",
    "desk presentation remains Ready — overdue is derived only",
  );
}

{
  // Legacy callers omit fulfilmentMethod — treat as pickup.
  const legacyPickup = collectionDeskAttention({
    readyAt: READY,
    pickedUpAt: null,
    pickupDate: "2026-08-16",
    pickupTime: "15:00:00",
    now: now16at1500,
  });
  assert.equal(legacyPickup.label, COLLECTION_PICKUP_OVERDUE_LABEL);
  assert.equal(legacyPickup.overdue, true);
}

{
  const deliveryAttention = collectionDeskAttention({
    readyAt: READY,
    pickedUpAt: null,
    fulfilmentMethod: "delivery",
    pickupDate: "2026-08-16",
    pickupTime: "15:00:00",
    now: now16at1500,
  });
  assert.equal(deliveryAttention.label, "Ready for Collection");
  assert.equal(deliveryAttention.overdue, false);
  assert.notEqual(
    deliveryAttention.label,
    COLLECTION_PICKUP_OVERDUE_LABEL,
    "Delivery ready must never show Pickup overdue",
  );
}

{
  const dineInAttention = collectionDeskAttention({
    readyAt: READY,
    pickedUpAt: null,
    fulfilmentMethod: "dine_in",
    pickupDate: "2026-08-16",
    pickupTime: "15:00:00",
    now: now16at1500,
  });
  assert.notEqual(
    dineInAttention.label,
    COLLECTION_PICKUP_OVERDUE_LABEL,
    "Dine-In must never show Pickup overdue",
  );
  assert.equal(dineInAttention.overdue, false);
}

{
  const collected = collectionDeskAttention({
    readyAt: READY,
    pickedUpAt: "2026-08-16T08:00:00.000Z",
    pickupDate: "2026-08-16",
    pickupTime: "15:00:00",
    now: now16at1501,
  });
  assert.equal(collected.label, "Picked Up");
  assert.equal(collected.overdue, false);
}

{
  const rows = [
    {
      pickupDate: "2026-08-16",
      pickupTime: "14:00:00",
      pickedUpAt: null,
      readyAt: READY,
    },
    {
      pickupDate: "2026-08-16",
      pickupTime: "16:00:00",
      pickedUpAt: null,
      readyAt: READY,
    },
    {
      pickupDate: "2026-08-16",
      pickupTime: "12:00:00",
      pickedUpAt: "x",
      readyAt: READY,
    },
  ];
  assert.equal(countCollectionPickupOverdue(rows, now16at1500), 1);
  assert.equal(countCollectionPickupOverdue(rows, now16at1459), 1);
  assert.equal(countCollectionPickupOverdue(rows, now16at1159), 0);
}

const cardSrc = readFileSync(
  resolve("src/workspaces/collection/CollectionOrderCard.tsx"),
  "utf8",
);
assert.match(cardSrc, /collectionDeskAttention/);
assert.match(cardSrc, /desk\.label/);
assert.doesNotMatch(cardSrc, /new Date\(/);

const boardSrc = readFileSync(
  resolve("src/workspaces/collection/CollectionLiveBoard.tsx"),
  "utf8",
);
assert.match(boardSrc, /countCollectionPickupOverdue/);
assert.match(boardSrc, /Pickup overdue · \{overdueCount\}/);
assert.match(boardSrc, /overdueCount > 0/);

const detailSrc = readFileSync(
  resolve("src/workspaces/collection/CollectionOrderDetail.tsx"),
  "utf8",
);
assert.match(detailSrc, /collectionDeskAttention/);
assert.match(detailSrc, /desk\.label/);

const actionsSrc = readFileSync(
  resolve("src/workspaces/collection/actions.ts"),
  "utf8",
);
assert.match(actionsSrc, /mark_guest_order_picked_up/);
assert.doesNotMatch(actionsSrc, /isCollectionPickupOverdue/);

const ownerAttentionSrc = readFileSync(
  resolve("src/engines/operations/owner-attention.ts"),
  "utf8",
);
assert.doesNotMatch(ownerAttentionSrc, /Pickup overdue/);
assert.doesNotMatch(ownerAttentionSrc, /isCollectionPickupOverdue/);

console.log("PASS Collection pickup overdue derivation");
