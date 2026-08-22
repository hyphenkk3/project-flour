/**
 * Live monthly catalogue copy.
 * Run: npx tsx scripts/test-library-catalogue-copy-live.ts
 *
 * Disposable catalogues only. Cleans up afterward.
 * Does not modify August membership, Library cakes, prices, or Product orders.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  copyCatalogueMembershipRows,
  findMonthlyCatalogueForMonth,
  monthlyCopySources,
} from "@/workspaces/library/collections/catalogue";

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
  console.log("SKIP catalogue copy live (missing Supabase env)");
  process.exit(0);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SIG = `CATALOGUE-COPY-${Date.now()}`;

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

async function monthExists(month: string): Promise<boolean> {
  const { data, error } = await admin
    .from("collections")
    .select("id")
    .eq("purpose", "monthly")
    .eq("month", month)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

async function pickFreeMonth(candidates: string[]): Promise<string> {
  for (const month of candidates) {
    if (!(await monthExists(month))) return month;
  }
  throw new Error("No free disposable month");
}

async function main() {
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

  const cakeIds = (cakesBefore ?? []).map((row) => String(row.id)).slice(0, 3);
  assert.ok(cakeIds.length >= 1, "need at least one Library cake");

  const sourceMonth = await pickFreeMonth([
    "2027-03-01",
    "2027-06-01",
    "2027-09-01",
  ]);
  const destMonth = await pickFreeMonth([
    "2027-04-01",
    "2027-07-01",
    "2027-10-01",
  ]);
  const emptyMonth = await pickFreeMonth([
    "2027-05-01",
    "2027-08-01",
    "2027-11-01",
  ]);

  const createdIds: string[] = [];
  try {
    const { data: source, error: sourceErr } = await admin
      .from("collections")
      .insert({
        name: `${SIG}-SOURCE`,
        month: sourceMonth,
        start_date: null,
        end_date: null,
        status: "active",
        purpose: "monthly",
        website_override: false,
      })
      .select("id, purpose, status, month, website_override, name")
      .single();
    assert.equal(sourceErr, null, sourceErr?.message);
    createdIds.push(source!.id);

    const sourceMembership = cakeIds.map((libraryCakeId, index) => ({
      collection_id: source.id,
      library_cake_id: libraryCakeId,
      available: index !== cakeIds.length - 1,
      sort_order: index,
    }));
    const { error: sourceMembersErr } = await admin
      .from("collection_cakes")
      .insert(sourceMembership);
    assert.equal(sourceMembersErr, null, sourceMembersErr?.message);

    const { data: special, error: specialErr } = await admin
      .from("collections")
      .insert({
        name: `${SIG}-SPECIAL`,
        month: null,
        start_date: "2027-01-01",
        end_date: "2027-01-02",
        status: "draft",
        purpose: "special",
        website_override: false,
      })
      .select("id, purpose, month, created_at, name")
      .single();
    assert.equal(specialErr, null, specialErr?.message);
    createdIds.push(special!.id);

    const selectable = monthlyCopySources([
      {
        id: source.id,
        name: source.name,
        month: String(source.month).slice(0, 10),
        createdAt: "2026-08-01T00:00:00.000Z",
        purpose: "monthly",
      },
      {
        id: special.id,
        name: special.name,
        month: "",
        createdAt: special.created_at,
        purpose: "special",
      },
    ]);
    assert.deepEqual(
      selectable.map((row) => row.id),
      [source.id],
    );
    assert.ok(!selectable.some((row) => row.id === special.id));

    const { data: sourceRows, error: sourceRowsErr } = await admin
      .from("collection_cakes")
      .select("library_cake_id, available, sort_order")
      .eq("collection_id", source.id)
      .order("sort_order", { ascending: true });
    assert.equal(sourceRowsErr, null, sourceRowsErr?.message);

    const { data: empty, error: emptyErr } = await admin
      .from("collections")
      .insert({
        name: `${SIG}-EMPTY`,
        month: emptyMonth,
        status: "draft",
        purpose: "monthly",
      })
      .select("id, status, website_override")
      .single();
    assert.equal(emptyErr, null, emptyErr?.message);
    createdIds.push(empty!.id);
    assert.equal(empty?.status, "draft");
    assert.equal(empty?.website_override ?? false, false);
    const { count: emptyCount } = await admin
      .from("collection_cakes")
      .select("id", { count: "exact", head: true })
      .eq("collection_id", empty!.id);
    assert.equal(emptyCount, 0, "empty monthly create copies no cakes");

    const copied = copyCatalogueMembershipRows(
      (sourceRows ?? []).map((row) => ({
        libraryCakeId: String(row.library_cake_id),
        available: row.available === true,
        sortOrder: Number(row.sort_order),
      })),
    );
    const { data: dest, error: destErr } = await admin
      .from("collections")
      .insert({
        name: `${SIG}-DEST`,
        month: destMonth,
        start_date: null,
        end_date: null,
        status: "draft",
        purpose: "monthly",
        website_override: false,
      })
      .select("id, purpose, status, month, website_override")
      .single();
    assert.equal(destErr, null, destErr?.message);
    createdIds.push(dest!.id);
    assert.notEqual(dest!.id, source.id);
    assert.equal(dest?.status, "draft");
    assert.equal(dest?.website_override, false);
    assert.equal(dest?.purpose, "monthly");

    const { error: destMembersErr } = await admin.from("collection_cakes").insert(
      copied.map((row) => ({
        collection_id: dest.id,
        library_cake_id: row.libraryCakeId,
        available: row.available,
        sort_order: row.sortOrder,
      })),
    );
    assert.equal(destMembersErr, null, destMembersErr?.message);

    const { data: destRows, error: destRowsErr } = await admin
      .from("collection_cakes")
      .select("id, library_cake_id, available, sort_order")
      .eq("collection_id", dest.id)
      .order("sort_order", { ascending: true });
    assert.equal(destRowsErr, null, destRowsErr?.message);
    assert.equal((destRows ?? []).length, (sourceRows ?? []).length);
    assert.deepEqual(
      (destRows ?? []).map((row) => String(row.library_cake_id)),
      (sourceRows ?? []).map((row) => String(row.library_cake_id)),
    );
    assert.deepEqual(
      (destRows ?? []).map((row) => row.available === true),
      (sourceRows ?? []).map((row) => row.available === true),
    );
    assert.deepEqual(
      (destRows ?? []).map((row) => Number(row.sort_order)),
      (sourceRows ?? []).map((row) => Number(row.sort_order)),
    );
    const destIds = new Set((destRows ?? []).map((row) => String(row.id)));
    const { data: sourceIds } = await admin
      .from("collection_cakes")
      .select("id")
      .eq("collection_id", source.id);
    for (const row of sourceIds ?? []) {
      assert.equal(destIds.has(String(row.id)), false);
    }
    assert.equal(
      new Set((destRows ?? []).map((row) => String(row.library_cake_id))).size,
      (destRows ?? []).length,
      "copied catalogue has no duplicate collection_cakes cake ids",
    );

    const firstDest = destRows?.[0];
    if (firstDest) {
      const { error: flipErr } = await admin
        .from("collection_cakes")
        .update({ available: !firstDest.available })
        .eq("id", firstDest.id)
        .eq("collection_id", dest.id);
      assert.equal(flipErr, null, flipErr?.message);
    }

    const { data: sourceAfterFlip } = await admin
      .from("collection_cakes")
      .select("library_cake_id, available, sort_order")
      .eq("collection_id", source.id)
      .order("sort_order", { ascending: true });
    assert.deepEqual(
      snapshotRows(sourceRows ?? []),
      snapshotRows(sourceAfterFlip ?? []),
      "changing the copied catalogue does not modify the source",
    );

    const duplicate = findMonthlyCatalogueForMonth(destMonth, [
      {
        id: dest.id,
        purpose: "monthly",
        month: destMonth,
      },
    ]);
    assert.ok(duplicate, "duplicate monthly month is detected");

    const { data: afterCopyStorefront } = await admin.rpc(
      "storefront_current_collection",
    );
    assert.equal(rowId(afterCopyStorefront), storefrontId);
  } finally {
    for (const id of [...createdIds].reverse()) {
      await admin.from("collection_cakes").delete().eq("collection_id", id);
      await admin.from("collections").delete().eq("id", id);
    }
  }

  const leftover = await admin.from("collections").select("id").in("id", createdIds);
  assert.equal((leftover.data ?? []).length, 0);

  const { data: cakesAfter } = await admin
    .from("library_cakes")
    .select("id, name, status, updated_at");
  assert.equal(
    snapshotRows(cakesBefore ?? []),
    snapshotRows(cakesAfter ?? []),
    "Library cakes unchanged",
  );

  const { data: sizesAfter } = await admin
    .from("library_cake_sizes")
    .select("id, cake_id, price, updated_at");
  assert.equal(
    snapshotRows(sizesBefore ?? []),
    snapshotRows(sizesAfter ?? []),
    "Library sizes/prices unchanged",
  );

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

  console.log("PASS library catalogue copy (live)");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
