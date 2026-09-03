/**
 * Guest pickup preorder hardening (collection identity, slots, price, receipt, contract).
 * Run: npx tsx scripts/test-guest-preorder-hardening.ts
 *
 * Live section creates disposable website guest orders only, then deletes them.
 * Does not touch known Product order IDs.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PICKUP_DATE_OVERRIDES } from "@/engines/business-calendar/pickup-date-overrides";
import {
  earliestPickupDateYmd,
  getPickupSlotsForDate,
  isValidPickupSlot,
} from "@/engines/business-calendar/pickup-slots";
import { addBusinessCalendarDays, toBusinessDateKey } from "@/lib/dates";
import {
  ownerAttentionInputFromOrder,
  ownerOperationsTodayGroup,
} from "@/engines/operations/owner-attention";
import { guestPreorderReceiptAuthorized } from "@/workspaces/storefront/checkout/receipt";
import { filterDraftItemsToOfferedCakes } from "@/workspaces/storefront/checkout/preorder-draft";
import type { PreorderDraftItem } from "@/workspaces/storefront/checkout/preorder-draft";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
const detailSrc = readSrc(
  "src/workspaces/storefront/catalog/StorefrontCakeDetail.tsx",
);
const checkoutSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
const receiptSrc = readSrc("src/workspaces/storefront/checkout/receipt.ts");
const migrationSrc = readSrc(
  "supabase/migrations/20260815220000_harden_guest_preorder.sql",
);
const successSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontSuccessPage.tsx",
);

assert.match(queriesSrc, /storefront_current_collection/);
assert.match(queriesSrc, /getStorefrontOfferedCakeById/);
assert.match(detailSrc, /getBrowsePublishedCakeById/);
assert.doesNotMatch(detailSrc, /getAvailableCakeById/);
assert.match(checkoutSrc, /getStorefrontCollectionForPickupDate/);
assert.match(checkoutSrc, /listAvailableCakes/);
assert.doesNotMatch(checkoutSrc, /getCurrentCollection/);
assert.match(checkoutSrc, /earliestPickupDateYmd/);
assert.match(checkoutSrc, /submit_guest_preorder/);
assert.match(checkoutSrc, /setGuestPreorderReceiptCookie/);
assert.doesNotMatch(checkoutSrc, /create_staff_guest_preorder/);
assert.doesNotMatch(checkoutSrc, /unit_price/);
assert.match(migrationSrc, /storefront_current_collection/);
assert.match(migrationSrc, /is_valid_public_pickup_slot/);
assert.match(
  migrationSrc,
  /active_collection := public.storefront_current_collection/,
);
assert.match(migrationSrc, /size_row.price/);
assert.match(migrationSrc, /'customer_website'/);
assert.match(migrationSrc, /'pickup'/);
assert.match(migrationSrc, /'submitted'/);
assert.match(successSrc, /getGuestPreorderReceipt/);
assert.match(receiptSrc, /GUEST_PREORDER_RECEIPT_COOKIE/);
assert.match(receiptSrc, /guestPreorderReceiptAuthorized/);

assert.deepEqual(
  PICKUP_DATE_OVERRIDES,
  {},
  "Date overrides still empty; SQL weekly profiles match production TS",
);

assert.equal(guestPreorderReceiptAuthorized("", "abc"), false);
assert.equal(guestPreorderReceiptAuthorized("a", null), false);
assert.equal(guestPreorderReceiptAuthorized("order-1", "order-2"), false);
assert.equal(guestPreorderReceiptAuthorized("order-1", "order-1"), true);

const catalogCakes = [
  {
    id: "cake-a",
    name: "Alpha",
    sizes: [{ id: "size-a", size: '6"', price: 125 }],
  },
];
const draftItems: PreorderDraftItem[] = [
  {
    cakeId: "cake-a",
    sizeId: "size-a",
    quantity: 1,
    cakeName: "stale",
    sizeLabel: "stale",
    unitPrice: 1,
  },
  {
    cakeId: "cake-out",
    sizeId: "size-out",
    quantity: 1,
    cakeName: "Gone",
    sizeLabel: '8"',
    unitPrice: 99,
  },
];
const filtered = filterDraftItemsToOfferedCakes(draftItems, catalogCakes);
assert.equal(filtered.dropped, true);
assert.equal(filtered.items.length, 1);
assert.equal(filtered.items[0]?.cakeName, "Alpha");
assert.equal(filtered.items[0]?.unitPrice, 125);

function nextValidPublicPickup(from = new Date()): { date: string; time: string } {
  let ymd = earliestPickupDateYmd(from);
  for (let i = 0; i < 21; i++) {
    const preferred =
      getPickupSlotsForDate(ymd).find((slot) => slot.value === "15:00") ??
      getPickupSlotsForDate(ymd)[0];
    if (preferred) return { date: ymd, time: preferred.value };
    ymd = addBusinessCalendarDays(ymd, 1) ?? ymd;
  }
  throw new Error("No public pickup slot in the next 21 days");
}

function nextWednesdayYmd(from = new Date()): string {
  let ymd = earliestPickupDateYmd(from);
  for (let i = 0; i < 14; i++) {
    const [year, month, day] = ymd.split("-").map(Number);
    if (new Date(year, month - 1, day).getDay() === 3) return ymd;
    ymd = addBusinessCalendarDays(ymd, 1) ?? ymd;
  }
  throw new Error("No Wednesday found");
}

assert.equal(
  earliestPickupDateYmd(new Date("2026-08-15T16:00:00.000Z")),
  "2026-08-18",
  "earliest pickup is 2 Malaysia calendar days ahead",
);
const valid = nextValidPublicPickup();
assert.equal(isValidPickupSlot(valid.date, valid.time), true);
assert.ok(valid.date >= earliestPickupDateYmd());

const wed = nextWednesdayYmd();
assert.equal(isValidPickupSlot(wed, "15:00"), true);
assert.equal(isValidPickupSlot(wed, "16:00"), false);

const submittedAttention = ownerOperationsTodayGroup({
  status: "submitted",
  confirmationNeedsResend: false,
  fulfilmentMethod: "pickup",
  readyAt: null,
  pickedUpAt: null,
  outForDeliveryAt: null,
  deliveredAt: null,
});
assert.equal(submittedAttention, "needs_attention");

console.log("PASS guest preorder hardening (static)");

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.log(
    "SKIP live guest preorder hardening (missing Supabase env)",
  );
  process.exit(0);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const cleanupIds: string[] = [];
let failed = 0;

function check(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  PASS ${label}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
}

async function deleteDisposableGuestOrder(orderId: string) {
  await admin.from("order_complimentary_items").delete().eq("order_id", orderId);
  await admin.from("order_timeline_events").delete().eq("order_id", orderId);
  await admin.from("order_items").delete().eq("order_id", orderId);
  await admin.from("orders").delete().eq("id", orderId).is("customer_id", null);
}

async function runLive() {
const collectionProbe = await admin.rpc("storefront_current_collection");
const probeMsg = collectionProbe.error?.message ?? "";
if (/Could not find the function|schema cache|does not exist/i.test(probeMsg)) {
  console.error(
    "BLOCKED: apply supabase/migrations/20260815220000_harden_guest_preorder.sql in Supabase SQL Editor, then re-run this test.",
  );
  console.error(probeMsg);
  process.exit(2);
}

try {
  const { data: currentCollection, error: collectionErr } = await admin.rpc(
    "storefront_current_collection",
  );
  check(
    collectionErr == null && Boolean(currentCollection?.id),
    "storefront_current_collection returns a row",
    collectionErr?.message,
  );
  const collectionId = currentCollection?.id as string | undefined;

  const slotProbeDates: string[] = [];
  let probe = earliestPickupDateYmd();
  for (let i = 0; i < 7; i++) {
    slotProbeDates.push(probe);
    probe = addBusinessCalendarDays(probe, 1) ?? probe;
  }
  for (const date of slotProbeDates) {
    const { data: sqlOk } = await admin.rpc("is_valid_public_pickup_slot", {
      p_date: date,
      p_time: "15:00",
    });
    check(
      Boolean(sqlOk) === isValidPickupSlot(date, "15:00"),
      `SQL/TS slot parity ${date} 15:00`,
    );
    const { data: sqlLate } = await admin.rpc("is_valid_public_pickup_slot", {
      p_date: date,
      p_time: "22:00",
    });
    check(sqlLate === false, `SQL rejects 22:00 on ${date}`);
    check(isValidPickupSlot(date, "22:00") === false, `TS rejects 22:00 on ${date}`);
  }

  const { data: offeredRows, error: offeredErr } = await admin
    .from("collection_cakes")
    .select(
      `
      library_cake_id,
      library_cakes (
        id,
        status,
        library_cake_sizes ( id, cake_id, price )
      )
    `,
    )
    .eq("collection_id", collectionId ?? "")
    .eq("available", true);
  check(offeredErr == null, "load collection cakes", offeredErr?.message);

  type SizeEmbed = { id: string; cake_id: string; price: number | string };
  type CakeEmbed = {
    id: string;
    status: string;
    library_cake_sizes: SizeEmbed[] | null;
  };
  const offeredCake = (offeredRows ?? [])
    .map((row) => {
      const cakes = row.library_cakes as CakeEmbed | CakeEmbed[] | null;
      return Array.isArray(cakes) ? cakes[0] : cakes;
    })
    .find(
      (cake) =>
        cake &&
        (cake.status === "active" || cake.status === "seasonal") &&
        (cake.library_cake_sizes ?? []).length > 0,
    );
  check(Boolean(offeredCake), "current collection has an offerable cake+size");

  const offeredSize = offeredCake?.library_cake_sizes?.[0];
  const items = offeredCake && offeredSize
    ? [
        {
          cake_id: offeredCake.id,
          cake_size_id: offeredSize.id,
          quantity: 1,
        },
      ]
    : [];

  const pickup = nextValidPublicPickup();

  if (items.length > 0) {
    const { data: created, error: createErr } = await admin.rpc(
      "submit_guest_preorder",
      {
        p_customer_name: `Hardening ${Date.now()}`,
        p_phone: "0190000001",
        p_email: null,
        p_pickup_date: pickup.date,
        p_pickup_time: pickup.time,
        p_notes: "disposable hardening test",
        p_items: items,
        p_email_submission_receipt_requested: false,
      },
    );
    if (created?.id) cleanupIds.push(created.id);
    check(createErr == null, "valid pickup slot submit succeeds", createErr?.message);

    if (created?.id) {
      const { data: orderRow } = await admin
        .from("orders")
        .select(
          "id, customer_id, order_source, fulfilment_method, status, collection_id, guest_name",
        )
        .eq("id", created.id)
        .maybeSingle();
      check(orderRow?.customer_id == null, "customer_id is null");
      check(orderRow?.order_source === "customer_website", "order_source customer_website");
      check(orderRow?.fulfilment_method === "pickup", "fulfilment_method pickup");
      check(orderRow?.status === "submitted", "status submitted");
      const pickupCatalogue = await admin.rpc(
        "storefront_collection_for_pickup_date",
        { p_pickup_date: pickup.date },
      );
      const pickupRpcMissing = /Could not find the function|schema cache|does not exist/i.test(
        pickupCatalogue.error?.message ?? "",
      );
      const pickupCatalogueId = pickupRpcMissing
        ? collectionId
        : (Array.isArray(pickupCatalogue.data)
            ? pickupCatalogue.data[0]
            : pickupCatalogue.data
          )?.id;
      check(
        orderRow?.collection_id === pickupCatalogueId,
        pickupRpcMissing
          ? "submitted collection_id == storefront_current_collection"
          : "submitted collection_id == storefront_collection_for_pickup_date",
        pickupCatalogue.error?.message,
      );

      const { data: itemRows } = await admin
        .from("order_items")
        .select("unit_price, cake_size_id")
        .eq("order_id", created.id);
      const line = itemRows?.[0];
      check(
        Number(line?.unit_price) === Number(offeredSize?.price),
        "order_items.unit_price snapshots library_cake_sizes.price",
        `got ${line?.unit_price} expected ${offeredSize?.price}`,
      );

      const attention = ownerOperationsTodayGroup(
        ownerAttentionInputFromOrder({
          status: "submitted",
          confirmationNeedsResend: false,
          fulfilmentMethod: "pickup",
          readyAt: null,
          pickedUpAt: null,
          outForDeliveryAt: null,
          deliveredAt: null,
        }),
      );
      check(
        attention === "needs_attention",
        "submitted guest preorder is Operations Needs Attention",
      );
    }
  }

  const todaySg = toBusinessDateKey();
  if (items.length > 0) {
    const { error: todayErr } = await admin.rpc("submit_guest_preorder", {
      p_customer_name: "Hardening Closed",
      p_phone: "0190000002",
      p_email: null,
      p_pickup_date: todaySg,
      p_pickup_time: "15:00",
      p_notes: null,
      p_items: items,
      p_email_submission_receipt_requested: false,
    });
    check(
      todayErr != null,
      "same-day / before earliest pickup fails at RPC",
      todayErr ? undefined : "RPC accepted today",
    );
  }

  if (items.length > 0) {
    const { error: invalidTimeErr } = await admin.rpc("submit_guest_preorder", {
      p_customer_name: "Hardening Bad Time",
      p_phone: "0190000003",
      p_email: null,
      p_pickup_date: wed,
      p_pickup_time: "16:00",
      p_notes: null,
      p_items: items,
      p_email_submission_receipt_requested: false,
    });
    check(
      invalidTimeErr != null,
      "invalid pickup time (Wednesday 16:00) fails at RPC",
      invalidTimeErr ? undefined : "RPC accepted Wednesday 16:00",
    );
  }

  const { data: libraryCakes } = await admin
    .from("library_cakes")
    .select("id, status")
    .in("status", ["active", "seasonal"])
    .limit(40);
  const offeredIds = new Set(
    (offeredRows ?? []).map((row) => row.library_cake_id as string),
  );
  const outsider = (libraryCakes ?? []).find((row) => !offeredIds.has(row.id));
  if (outsider && offeredSize) {
    const { data: outsiderSizes } = await admin
      .from("library_cake_sizes")
      .select("id")
      .eq("cake_id", outsider.id)
      .limit(1);
    const outsiderSizeId = outsiderSizes?.[0]?.id;
    if (outsiderSizeId) {
      const { error: outsiderErr } = await admin.rpc("submit_guest_preorder", {
        p_customer_name: "Hardening Outsider",
        p_phone: "0190000004",
        p_email: null,
        p_pickup_date: pickup.date,
        p_pickup_time: pickup.time,
        p_notes: null,
        p_items: [
          {
            cake_id: outsider.id,
            cake_size_id: outsiderSizeId,
            quantity: 1,
          },
        ],
        p_email_submission_receipt_requested: false,
      });
      check(
        outsiderErr != null,
        "out-of-collection cake cannot be submitted",
        outsiderErr ? undefined : "RPC accepted outsider cake",
      );
    } else {
      check(true, "skip outsider cake (no size) — no extra library cake");
    }
  } else {
    const { error: missingErr } = await admin.rpc("submit_guest_preorder", {
      p_customer_name: "Hardening Missing",
      p_phone: "0190000005",
      p_email: null,
      p_pickup_date: pickup.date,
      p_pickup_time: pickup.time,
      p_notes: null,
      p_items: [
        {
          cake_id: "00000000-0000-4000-8000-000000000000",
          cake_size_id: "00000000-0000-4000-8000-000000000001",
          quantity: 1,
        },
      ],
      p_email_submission_receipt_requested: false,
    });
    check(
      missingErr != null,
      "unknown cake cannot be submitted",
      missingErr ? undefined : "RPC accepted unknown cake",
    );
  }

  check(
    guestPreorderReceiptAuthorized("other-order", cleanupIds[0] ?? "x") === false,
    "thank-you cookie does not authorize a different order UUID",
  );
  if (cleanupIds[0]) {
    check(
      guestPreorderReceiptAuthorized(cleanupIds[0], cleanupIds[0]) === true,
      "thank-you cookie authorizes the submitted order only",
    );
  }
} catch (error) {
  failed += 1;
  console.error(error);
} finally {
  for (const id of cleanupIds) {
    await deleteDisposableGuestOrder(id);
  }
}

if (failed > 0) {
  console.error(`FAIL guest preorder hardening live (${failed})`);
  process.exit(1);
}

console.log("PASS guest preorder hardening (live)");
}

void runLive();
