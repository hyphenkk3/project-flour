/**
 * Live order-availability overlay for submit_guest_preorder.
 * Run: npx tsx scripts/test-order-availability-live.ts
 *
 * Disposable guest order + availability override only. Cleans both up.
 * Does not change Library cakes, catalogue membership, or Product orders.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  earliestPickupDateYmd,
  getPickupSlotsForDate,
  isValidPickupSlot,
} from "@/engines/business-calendar/pickup-slots";
import { addBusinessCalendarDays } from "@/lib/dates";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceRoleKey) {
  console.log("SKIP order availability live (missing Supabase env)");
  process.exit(0);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SIG = `OA-LIVE-${Date.now()}`;

function rowId(data: unknown): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  const id = (row as { id?: string } | null)?.id;
  return id ? String(id) : null;
}

function nextValidPublicPickup(fromYmd: string): { date: string; time: string } {
  let ymd = fromYmd;
  for (let i = 0; i < 28; i++) {
    const preferred =
      getPickupSlotsForDate(ymd).find((slot) => slot.value === "15:00") ??
      getPickupSlotsForDate(ymd)[0];
    if (preferred) return { date: ymd, time: preferred.value };
    ymd = addBusinessCalendarDays(ymd, 1) ?? ymd;
  }
  throw new Error("No public pickup slot found");
}

function nextWednesdayYmd(fromYmd: string): string {
  let ymd = fromYmd;
  for (let i = 0; i < 14; i++) {
    const [year, month, day] = ymd.split("-").map(Number);
    if (new Date(year, month - 1, day).getDay() === 3) return ymd;
    ymd = addBusinessCalendarDays(ymd, 1) ?? ymd;
  }
  throw new Error("No Wednesday found");
}

async function deleteDisposableGuestOrder(orderId: string) {
  await admin.from("order_complimentary_items").delete().eq("order_id", orderId);
  await admin.from("order_timeline_events").delete().eq("order_id", orderId);
  await admin.from("order_items").delete().eq("order_id", orderId);
  await admin.from("orders").delete().eq("id", orderId).is("customer_id", null);
}

function snapshotRows<T extends Record<string, unknown>>(rows: T[] | null): string {
  return JSON.stringify(
    [...(rows ?? [])].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

async function main() {
  const tableProbe = await admin
    .from("order_availability_overrides")
    .select("pickup_date")
    .limit(1);
  if (
    tableProbe.error &&
    /order_availability_overrides|schema cache|does not exist/i.test(
      tableProbe.error.message,
    )
  ) {
    console.log(
      "SKIP order availability live (apply 20260816190000_order_availability.sql)",
    );
    process.exit(0);
  }
  assert.equal(tableProbe.error, null, tableProbe.error?.message);

  const { data: current, error: currentErr } = await admin.rpc(
    "storefront_current_collection",
  );
  assert.equal(currentErr, null, currentErr?.message);
  const storefrontId = rowId(current);
  assert.ok(storefrontId, "storefront has a current catalogue");

  const { data: storefrontRow, error: storefrontErr } = await admin
    .from("collections")
    .select("id, purpose, month, website_override, start_date, end_date")
    .eq("id", storefrontId)
    .maybeSingle();
  assert.equal(storefrontErr, null, storefrontErr?.message);

  const { data: membershipBefore, error: membershipErr } = await admin
    .from("collection_cakes")
    .select("id, collection_id, library_cake_id, available, sort_order")
    .eq("collection_id", storefrontId);
  assert.equal(membershipErr, null, membershipErr?.message);

  const { data: cakesBefore, error: cakesErr } = await admin
    .from("library_cakes")
    .select("id, name, status, updated_at");
  assert.equal(cakesErr, null, cakesErr?.message);

  const { count: ordersBefore, error: ordersErr } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true });
  assert.equal(ordersErr, null, ordersErr?.message);

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
    .eq("collection_id", storefrontId)
    .eq("available", true)
    .limit(5);
  assert.equal(offeredErr, null, offeredErr?.message);

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
  assert.ok(offeredCake, "current catalogue has an offerable cake");
  const offeredSize = offeredCake.library_cake_sizes?.[0];
  assert.ok(offeredSize, "offerable cake has a size");
  const items = [
    {
      cake_id: offeredCake.id,
      cake_size_id: offeredSize.id,
      quantity: 1,
    },
  ];

  const openPickup = nextValidPublicPickup(earliestPickupDateYmd());
  const wed = nextWednesdayYmd(earliestPickupDateYmd());
  const cleanupOrderIds: string[] = [];
  let closedInserted = false;
  let closedPickup = nextValidPublicPickup(
    addBusinessCalendarDays(openPickup.date, 21) ?? openPickup.date,
  );

  try {
    const { data: createdOpen, error: openErr } = await admin.rpc(
      "submit_guest_preorder",
      {
        p_customer_name: `${SIG} open`,
        p_phone: "0190001101",
        p_email: null,
        p_pickup_date: openPickup.date,
        p_pickup_time: openPickup.time,
        p_notes: `${SIG} disposable open`,
        p_items: items,
        p_email_submission_receipt_requested: false,
      },
    );
    if (createdOpen?.id) cleanupOrderIds.push(createdOpen.id);
    assert.equal(openErr, null, openErr?.message);
    assert.ok(createdOpen?.id, "valid pickup date still succeeds");

    const { error: invalidTimeErr } = await admin.rpc("submit_guest_preorder", {
      p_customer_name: `${SIG} bad time`,
      p_phone: "0190001103",
      p_email: null,
      p_pickup_date: wed,
      p_pickup_time: "16:00",
      p_notes: null,
      p_items: items,
      p_email_submission_receipt_requested: false,
    });
    assert.ok(invalidTimeErr, "invalid pickup time remains rejected");
    assert.doesNotMatch(
      invalidTimeErr?.message ?? "",
      /Orders are closed for that pickup date/i,
    );

    for (let i = 0; i < 14; i += 1) {
      const candidate = nextValidPublicPickup(
        addBusinessCalendarDays(closedPickup.date, i) ?? closedPickup.date,
      );
      if (candidate.date === openPickup.date || candidate.date === wed) {
        continue;
      }
      const { data: existing } = await admin
        .from("order_availability_overrides")
        .select("pickup_date")
        .eq("pickup_date", candidate.date)
        .maybeSingle();
      if (!existing) {
        closedPickup = candidate;
        break;
      }
    }
    assert.notEqual(openPickup.date, closedPickup.date);
    assert.equal(isValidPickupSlot(closedPickup.date, closedPickup.time), true);

    const { error: insertErr } = await admin
      .from("order_availability_overrides")
      .insert({
        pickup_date: closedPickup.date,
        closed: true,
        note: `${SIG} Owner note must stay internal`,
      });
    assert.equal(insertErr, null, insertErr?.message);
    closedInserted = true;

    const { data: listed, error: listErr } = await admin.rpc(
      "list_closed_pickup_order_dates",
      {
        p_from: closedPickup.date,
        p_to: closedPickup.date,
      },
    );
    assert.equal(listErr, null, listErr?.message);
    const listedDates = (listed ?? []).map((row: { pickup_date?: string } | string) =>
      typeof row === "string" ? row.slice(0, 10) : String(row.pickup_date ?? "").slice(0, 10),
    );
    assert.ok(listedDates.includes(closedPickup.date));
    assert.equal(
      JSON.stringify(listed ?? "").includes("Owner note"),
      false,
      "customer list RPC does not expose Owner notes",
    );

    const { data: closedFlag, error: closedFlagErr } = await admin.rpc(
      "is_pickup_orders_closed",
      { p_date: closedPickup.date },
    );
    assert.equal(closedFlagErr, null, closedFlagErr?.message);
    assert.equal(closedFlag, true);

    for (const time of ["15:00", "16:00", "18:00"]) {
      const { data: slotOk, error: slotErr } = await admin.rpc(
        "is_valid_public_pickup_slot",
        {
          p_date: closedPickup.date,
          p_time: time,
        },
      );
      assert.equal(slotErr, null, slotErr?.message);
      assert.equal(
        slotOk,
        false,
        `closed date rejects ${time} even if the clock time is a weekly slot`,
      );

      const { data: closedOrder, error: closedErr } = await admin.rpc(
        "submit_guest_preorder",
        {
          p_customer_name: `${SIG} closed ${time}`,
          p_phone: "0190001102",
          p_email: null,
          p_pickup_date: closedPickup.date,
          p_pickup_time: time,
          p_notes: `${SIG} should fail`,
          p_items: items,
          p_email_submission_receipt_requested: false,
        },
      );
      if (closedOrder?.id) cleanupOrderIds.push(closedOrder.id);
      assert.ok(closedErr, `direct RPC must reject closed date at ${time}`);
      assert.match(
        closedErr?.message ?? "",
        /Orders are closed for that pickup date/i,
      );
    }

    if (anonKey) {
      const anon = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: anonInsertErr } = await anon
        .from("order_availability_overrides")
        .insert({
          pickup_date: addBusinessCalendarDays(closedPickup.date, 1),
          closed: true,
          note: `${SIG} anon must not write`,
        });
      assert.ok(anonInsertErr, "anonymous customers cannot write availability");

      const { error: anonUpdateErr } = await anon
        .from("order_availability_overrides")
        .update({ note: "hacked" })
        .eq("pickup_date", closedPickup.date);
      assert.ok(anonUpdateErr, "anonymous customers cannot update availability");

      const { error: anonDeleteErr } = await anon
        .from("order_availability_overrides")
        .delete()
        .eq("pickup_date", closedPickup.date);
      assert.ok(anonDeleteErr, "anonymous customers cannot delete availability");

      const { data: anonList, error: anonListErr } = await anon.rpc(
        "list_closed_pickup_order_dates",
        {
          p_from: closedPickup.date,
          p_to: closedPickup.date,
        },
      );
      assert.equal(anonListErr, null, anonListErr?.message);
      const anonDates = (anonList ?? []).map(
        (row: { pickup_date?: string } | string) =>
          typeof row === "string"
            ? row.slice(0, 10)
            : String(row.pickup_date ?? "").slice(0, 10),
      );
      assert.ok(anonDates.includes(closedPickup.date));
    }

    const { error: reopenErr } = await admin
      .from("order_availability_overrides")
      .delete()
      .eq("pickup_date", closedPickup.date);
    assert.equal(reopenErr, null, reopenErr?.message);
    closedInserted = false;

    const { data: reopenedFlag } = await admin.rpc("is_pickup_orders_closed", {
      p_date: closedPickup.date,
    });
    assert.equal(reopenedFlag, false);

    const { data: reopenedOrder, error: reopenedErr } = await admin.rpc(
      "submit_guest_preorder",
      {
        p_customer_name: `${SIG} reopened`,
        p_phone: "0190001104",
        p_email: null,
        p_pickup_date: closedPickup.date,
        p_pickup_time: closedPickup.time,
        p_notes: `${SIG} disposable reopened`,
        p_items: items,
        p_email_submission_receipt_requested: false,
      },
    );
    if (reopenedOrder?.id) cleanupOrderIds.push(reopenedOrder.id);
    assert.equal(reopenedErr, null, reopenedErr?.message);
    assert.ok(reopenedOrder?.id, "reopening the date allows a valid preorder");

    const { data: currentAfter } = await admin.rpc("storefront_current_collection");
    assert.equal(rowId(currentAfter), storefrontId);

    if (storefrontRow?.month) {
      assert.equal(storefrontRow.purpose ?? "monthly", "monthly");
      assert.equal(storefrontRow.website_override ?? false, false);
    }

    const { data: membershipAfter, error: membershipAfterErr } = await admin
      .from("collection_cakes")
      .select("id, collection_id, library_cake_id, available, sort_order")
      .eq("collection_id", storefrontId);
    assert.equal(membershipAfterErr, null, membershipAfterErr?.message);
    assert.equal(
      snapshotRows(membershipBefore ?? []),
      snapshotRows(membershipAfter ?? []),
      "closing a date does not modify catalogue membership",
    );

    const { data: cakesAfter, error: cakesAfterErr } = await admin
      .from("library_cakes")
      .select("id, name, status, updated_at");
    assert.equal(cakesAfterErr, null, cakesAfterErr?.message);
    assert.equal(
      snapshotRows(cakesBefore ?? []),
      snapshotRows(cakesAfter ?? []),
      "closing a date does not modify Library cakes",
    );

    const dateProbe =
      storefrontRow?.month && String(storefrontRow.month).startsWith("2026-08")
        ? "2026-08-16"
        : null;
    if (dateProbe) {
      const { data: forDate, error: forDateErr } = await admin.rpc(
        "storefront_collection_for_date",
        { target_date: dateProbe },
      );
      if (
        !forDateErr ||
        !/Could not find the function|schema cache/i.test(forDateErr.message)
      ) {
        assert.equal(forDateErr, null, forDateErr?.message);
        assert.equal(
          rowId(forDate),
          storefrontId,
          "August 2026 storefront catalogue identity unchanged",
        );
      }
    }
  } finally {
    for (const id of cleanupOrderIds) {
      await deleteDisposableGuestOrder(id);
    }
    if (closedInserted) {
      await admin
        .from("order_availability_overrides")
        .delete()
        .eq("pickup_date", closedPickup.date);
    }
    await admin
      .from("order_availability_overrides")
      .delete()
      .like("note", `${SIG}%`);
  }

  const leftover = await admin
    .from("order_availability_overrides")
    .select("pickup_date")
    .like("note", `${SIG}%`);
  assert.equal((leftover.data ?? []).length, 0, "no leftover availability overrides");

  const leftoverOrders = await admin
    .from("orders")
    .select("id")
    .like("guest_name", `${SIG}%`);
  assert.equal((leftoverOrders.data ?? []).length, 0, "no leftover disposable orders");

  const { count: ordersAfter, error: ordersAfterErr } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true });
  assert.equal(ordersAfterErr, null, ordersAfterErr?.message);
  assert.equal(ordersAfter, ordersBefore, "Product orders untouched after cleanup");

  console.log("PASS order availability (live)");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
