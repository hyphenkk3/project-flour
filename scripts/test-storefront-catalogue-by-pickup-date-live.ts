/**
 * Live: customer catalogue from pickup date. Disposable catalogues only.
 * Run: npx tsx scripts/test-storefront-catalogue-by-pickup-date-live.ts
 *
 * Creates no Product orders. Guest RPC rows are deleted before exit.
 * Does not mutate August membership, Library cakes, prices, or sizes.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { unpublishedCataloguePreorderMessage } from "@/workspaces/storefront/catalog/queries";

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

if (!url || !serviceRoleKey) {
  console.log("SKIP storefront pickup-date catalogue live (missing Supabase env)");
  process.exit(0);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SIG = `PICKUP-CAT-${Date.now()}`;

function lastDayOfMonth(monthStart: string): string {
  const [year, monthNum] = monthStart.slice(0, 7).split("-").map(Number);
  const date = new Date(year, monthNum, 0);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rowId(data: unknown): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  const id = (row as { id?: string } | null)?.id;
  return id ? String(id) : null;
}

function snapshotRows<T extends Record<string, unknown>>(
  rows: T[] | null,
): string {
  return JSON.stringify(
    [...(rows ?? [])].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    ),
  );
}

async function monthFree(month: string): Promise<boolean> {
  const { data, error } = await admin
    .from("collections")
    .select("id")
    .eq("purpose", "monthly")
    .eq("month", month)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length === 0;
}

async function collectionForPickup(date: string): Promise<string | null> {
  const { data, error } = await admin.rpc(
    "storefront_collection_for_pickup_date",
    { p_pickup_date: date },
  );
  if (error) throw new Error(error.message);
  return rowId(data);
}

async function deleteDisposableGuestOrder(orderId: string) {
  await admin.from("order_complimentary_items").delete().eq("order_id", orderId);
  await admin.from("order_timeline_events").delete().eq("order_id", orderId);
  await admin.from("order_items").delete().eq("order_id", orderId);
  await admin.from("orders").delete().eq("id", orderId).is("customer_id", null);
}

async function main() {
  const probe = await admin.rpc("storefront_collection_for_pickup_date", {
    p_pickup_date: "2028-09-01",
  });
  if (
    /Could not find the function|schema cache|does not exist/i.test(
      probe.error?.message ?? "",
    )
  ) {
    console.error(
      "BLOCKED: apply supabase/migrations/20260816200000_storefront_collection_for_pickup_date.sql in Supabase SQL Editor, then re-run this test.",
    );
    console.error(probe.error?.message);
    process.exit(2);
  }

  const { data: current, error: currentErr } = await admin.rpc(
    "storefront_current_collection",
  );
  assert.equal(currentErr, null, currentErr?.message);
  const storefrontId = rowId(current);
  assert.ok(storefrontId, "storefront has a current catalogue");

  const { data: membershipBefore, error: membershipErr } = await admin
    .from("collection_cakes")
    .select("id, collection_id, library_cake_id, available, sort_order")
    .eq("collection_id", storefrontId);
  assert.equal(membershipErr, null, membershipErr?.message);

  const { data: cakesBefore, error: cakesErr } = await admin
    .from("library_cakes")
    .select("id, name, status, updated_at");
  assert.equal(cakesErr, null, cakesErr?.message);

  const { data: sizesBefore, error: sizesErr } = await admin
    .from("library_cake_sizes")
    .select("id, cake_id, price, updated_at");
  assert.equal(sizesErr, null, sizesErr?.message);

  const { data: offerable } = await admin
    .from("library_cakes")
    .select("id, library_cake_sizes ( id )")
    .in("status", ["active", "seasonal"]);
  const cakesWithSize = (offerable ?? []).filter((row) => {
    const sizes = row.library_cake_sizes as Array<{ id: string }> | null;
    return (sizes ?? []).length > 0;
  });
  assert.ok(
    cakesWithSize.length >= 2,
    "need two offerable Library cakes with sizes",
  );
  const cakeA = cakesWithSize[0]!;
  const cakeB = cakesWithSize[1]!;
  const sizeA = (cakeA.library_cake_sizes as Array<{ id: string }>)[0]!.id;
  const sizeB = (cakeB.library_cake_sizes as Array<{ id: string }>)[0]!.id;

  const monthPairs = [
    ["2028-08-01", "2028-09-01"],
    ["2029-02-01", "2029-03-01"],
    ["2029-10-01", "2029-11-01"],
  ];
  let augustMonth: string | null = null;
  let septemberMonth: string | null = null;
  for (const [aug, sep] of monthPairs) {
    if ((await monthFree(aug)) && (await monthFree(sep))) {
      augustMonth = aug;
      septemberMonth = sep;
      break;
    }
  }
  assert.ok(augustMonth && septemberMonth, "need two free future monthly months");

  const createdIds: string[] = [];
  const orderIds: string[] = [];
  let closedDate: string | null = null;
  let closedInserted = false;

  const augPickup = lastDayOfMonth(augustMonth);
  const sepPickup = `${septemberMonth.slice(0, 7)}-01`;
  const sep15 = `${septemberMonth.slice(0, 7)}-15`;
  const sep16 = `${septemberMonth.slice(0, 7)}-16`;
  const sep17 = `${septemberMonth.slice(0, 7)}-17`;
  const sep18 = `${septemberMonth.slice(0, 7)}-18`;
  const sepOpen = `${septemberMonth.slice(0, 7)}-02`;

  try {
    const { data: augustCat, error: augErr } = await admin
      .from("collections")
      .insert({
        name: `${SIG}-AUG`,
        month: augustMonth,
        status: "active",
        purpose: "monthly",
        website_override: false,
      })
      .select("id")
      .single();
    assert.equal(augErr, null, augErr?.message);
    createdIds.push(augustCat!.id);

    const { data: septemberCat, error: sepErr } = await admin
      .from("collections")
      .insert({
        name: `${SIG}-SEP`,
        month: septemberMonth,
        status: "draft",
        purpose: "monthly",
        website_override: false,
      })
      .select("id")
      .single();
    assert.equal(sepErr, null, sepErr?.message);
    createdIds.push(septemberCat!.id);

    const { error: memAugErr } = await admin.from("collection_cakes").insert({
      collection_id: augustCat!.id,
      library_cake_id: cakeB.id,
      available: true,
      sort_order: 0,
    });
    assert.equal(memAugErr, null, memAugErr?.message);

    const { error: memSepErr } = await admin.from("collection_cakes").insert({
      collection_id: septemberCat!.id,
      library_cake_id: cakeA.id,
      available: true,
      sort_order: 0,
    });
    assert.equal(memSepErr, null, memSepErr?.message);

    assert.equal(
      await collectionForPickup(sepPickup),
      null,
      "B/G: unpublished September must not fall back to August",
    );
    assert.equal(
      unpublishedCataloguePreorderMessage(sepPickup).includes("catalogue is not yet available"),
      true,
    );

    const { error: unpublishedSubmitErr } = await admin.rpc(
      "submit_guest_preorder",
      {
        p_customer_name: `${SIG} unpublished`,
        p_phone: "0190000101",
        p_email: null,
        p_pickup_date: sepPickup,
        p_pickup_time: "15:00",
        p_notes: null,
        p_items: [
          { cake_id: cakeA.id, cake_size_id: sizeA, quantity: 1 },
        ],
        p_email_submission_receipt_requested: false,
      },
    );
    assert.ok(unpublishedSubmitErr, "B: September Draft must reject customer submit");
    assert.match(
      unpublishedSubmitErr.message,
      /No published catalogue is available for that pickup date/,
    );

    const { error: publishErr } = await admin
      .from("collections")
      .update({ status: "active" })
      .eq("id", septemberCat!.id)
      .eq("status", "draft");
    assert.equal(publishErr, null, publishErr?.message);

    assert.equal(
      await collectionForPickup(augPickup),
      augustCat!.id,
      "A/C: Aug 31 uses August catalogue",
    );
    assert.equal(
      await collectionForPickup(sepPickup),
      septemberCat!.id,
      "A/C: Sep 1 uses September catalogue",
    );
    assert.notEqual(
      await collectionForPickup(augPickup),
      septemberCat!.id,
      "September must not apply to August pickup",
    );

    const { data: afterPublishCurrent } = await admin.rpc(
      "storefront_current_collection",
    );
    assert.equal(
      rowId(afterPublishCurrent),
      storefrontId,
      "publishing a future monthly does not replace today's storefront",
    );

    const { error: septCakeAugustDate } = await admin.rpc(
      "submit_guest_preorder",
      {
        p_customer_name: `${SIG} cross month`,
        p_phone: "0190000102",
        p_email: null,
        p_pickup_date: augPickup,
        p_pickup_time: "15:00",
        p_notes: null,
        p_items: [
          { cake_id: cakeA.id, cake_size_id: sizeA, quantity: 1 },
        ],
        p_email_submission_receipt_requested: false,
      },
    );
    assert.ok(septCakeAugustDate, "F: September-only cake + August pickup rejected");

    const { error: augCakeSeptemberDate } = await admin.rpc(
      "submit_guest_preorder",
      {
        p_customer_name: `${SIG} reverse cross`,
        p_phone: "0190000103",
        p_email: null,
        p_pickup_date: sepPickup,
        p_pickup_time: "15:00",
        p_notes: null,
        p_items: [
          { cake_id: cakeB.id, cake_size_id: sizeB, quantity: 1 },
        ],
        p_email_submission_receipt_requested: false,
      },
    );
    assert.ok(augCakeSeptemberDate, "F: August-only cake + September pickup rejected");

    const { data: accepted, error: acceptErr } = await admin.rpc(
      "submit_guest_preorder",
      {
        p_customer_name: `${SIG} valid sep`,
        p_phone: "0190000104",
        p_email: null,
        p_pickup_date: sepPickup,
        p_pickup_time: "15:00",
        p_notes: "disposable pickup-date catalogue test",
        p_items: [
          { cake_id: cakeA.id, cake_size_id: sizeA, quantity: 1 },
        ],
        p_email_submission_receipt_requested: false,
      },
    );
    if (accepted?.id) orderIds.push(accepted.id);
    assert.equal(acceptErr, null, acceptErr?.message);
    assert.equal(accepted?.collection_id, septemberCat!.id);
    assert.equal(accepted?.customer_id, null);
    assert.equal(accepted?.order_source, "customer_website");
    assert.equal(accepted?.fulfilment_method, "pickup");
    assert.equal(accepted?.status, "submitted");

    const { data: special, error: specialErr } = await admin
      .from("collections")
      .insert({
        name: `${SIG}-SPECIAL`,
        month: null,
        start_date: sep16,
        end_date: sep17,
        status: "active",
        purpose: "special",
        website_override: true,
      })
      .select("id")
      .single();
    assert.equal(specialErr, null, specialErr?.message);
    createdIds.push(special!.id);

    assert.equal(await collectionForPickup(sep15), septemberCat!.id, "D: Sep 15 monthly");
    assert.equal(await collectionForPickup(sep16), special!.id, "D: Sep 16 special");
    assert.equal(await collectionForPickup(sep17), special!.id, "D: Sep 17 special");
    assert.equal(await collectionForPickup(sep18), septemberCat!.id, "D: Sep 18 monthly");
    assert.equal(
      await collectionForPickup(augPickup),
      augustCat!.id,
      "D: Aug 31 is not the special",
    );

    const { error: overrideOffErr } = await admin
      .from("collections")
      .update({ website_override: false })
      .eq("id", special!.id);
    assert.equal(overrideOffErr, null, overrideOffErr?.message);
    assert.equal(
      await collectionForPickup(sep16),
      septemberCat!.id,
      "E: special override off uses September monthly",
    );

    const { data: alreadyClosed } = await admin
      .from("order_availability_overrides")
      .select("pickup_date")
      .eq("pickup_date", sepOpen)
      .maybeSingle();
    if (!alreadyClosed) {
      const { error: closeErr } = await admin
        .from("order_availability_overrides")
        .insert({ pickup_date: sepOpen, closed: true, note: SIG });
      assert.equal(closeErr, null, closeErr?.message);
      closedInserted = true;
      closedDate = sepOpen;
    } else {
      closedDate = sepOpen;
    }

    const { error: closedSubmitErr } = await admin.rpc("submit_guest_preorder", {
      p_customer_name: `${SIG} closed`,
      p_phone: "0190000105",
      p_email: null,
      p_pickup_date: sepOpen,
      p_pickup_time: "15:00",
      p_notes: null,
      p_items: [{ cake_id: cakeA.id, cake_size_id: sizeA, quantity: 1 }],
      p_email_submission_receipt_requested: false,
    });
    assert.ok(closedSubmitErr, "H: closed pickup date rejected");
    assert.match(closedSubmitErr.message, /Orders are closed for that pickup date/);

    const { error: unpublishErr } = await admin
      .from("collections")
      .update({ status: "draft" })
      .eq("id", septemberCat!.id)
      .eq("status", "active");
    assert.equal(unpublishErr, null, unpublishErr?.message);
    assert.equal(
      await collectionForPickup(sepPickup),
      null,
      "unpublish September: no applicable catalogue, no August fallback",
    );

    const { data: sepMembers } = await admin
      .from("collection_cakes")
      .select("library_cake_id, available, sort_order")
      .eq("collection_id", septemberCat!.id);
    assert.equal(sepMembers?.length, 1);
    assert.equal(sepMembers?.[0]?.library_cake_id, cakeA.id);
  } finally {
    for (const id of orderIds) {
      await deleteDisposableGuestOrder(id);
    }
    if (closedInserted && closedDate) {
      await admin
        .from("order_availability_overrides")
        .delete()
        .eq("pickup_date", closedDate)
        .eq("note", SIG);
    }
    for (const id of [...createdIds].reverse()) {
      await admin.from("collection_cakes").delete().eq("collection_id", id);
      await admin.from("collections").delete().eq("id", id);
    }
  }

  const leftover = await admin
    .from("collections")
    .select("id")
    .in("id", createdIds);
  assert.equal((leftover.data ?? []).length, 0);

  const leftoverOrders = await admin
    .from("orders")
    .select("id")
    .in("id", orderIds);
  assert.equal((leftoverOrders.data ?? []).length, 0);

  const { data: cakesAfter } = await admin
    .from("library_cakes")
    .select("id, name, status, updated_at");
  assert.equal(snapshotRows(cakesBefore ?? []), snapshotRows(cakesAfter ?? []));

  const { data: sizesAfter } = await admin
    .from("library_cake_sizes")
    .select("id, cake_id, price, updated_at");
  assert.equal(snapshotRows(sizesBefore ?? []), snapshotRows(sizesAfter ?? []));

  const { data: membershipAfter } = await admin
    .from("collection_cakes")
    .select("id, collection_id, library_cake_id, available, sort_order")
    .eq("collection_id", storefrontId);
  assert.equal(
    snapshotRows(membershipBefore ?? []),
    snapshotRows(membershipAfter ?? []),
    "August/current website catalogue membership unchanged",
  );

  const { data: restored } = await admin.rpc("storefront_current_collection");
  assert.equal(rowId(restored), storefrontId);

  console.log("PASS storefront catalogue by pickup date (live)");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
