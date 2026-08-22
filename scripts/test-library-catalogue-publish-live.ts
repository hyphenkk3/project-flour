/**
 * Live publish catalogue (Draft → Active).
 * Run: npx tsx scripts/test-library-catalogue-publish-live.ts
 *
 * Disposable catalogues only. Cleans up afterward.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  console.log("SKIP catalogue publish live (missing Supabase env)");
  process.exit(0);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SIG = `CATALOGUE-PUBLISH-${Date.now()}`;

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

async function main() {
  const { data: current, error: currentErr } = await admin.rpc(
    "storefront_current_collection",
  );
  assert.equal(currentErr, null, currentErr?.message);
  const storefrontId = rowId(current);
  assert.ok(storefrontId);

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

  const monthCandidates = ["2027-11-01", "2027-12-01", "2028-01-01"];
  let month: string | null = null;
  for (const candidate of monthCandidates) {
    if (await monthFree(candidate)) {
      month = candidate;
      break;
    }
  }
  assert.ok(month, "need a free monthly catalogue month");

  const cakeId = cakesBefore?.[0]?.id;
  const createdIds: string[] = [];
  try {
    const { data: monthly, error: monthlyErr } = await admin
      .from("collections")
      .insert({
        name: `${SIG}-MONTHLY`,
        month,
        status: "draft",
        purpose: "monthly",
        website_override: false,
      })
      .select("id, status, website_override, purpose")
      .single();
    assert.equal(monthlyErr, null, monthlyErr?.message);
    createdIds.push(monthly!.id);
    assert.equal(monthly?.status, "draft");
    assert.equal(monthly?.website_override, false);

    if (cakeId) {
      const { error: memberErr } = await admin.from("collection_cakes").insert({
        collection_id: monthly!.id,
        library_cake_id: cakeId,
        available: true,
        sort_order: 0,
      });
      assert.equal(memberErr, null, memberErr?.message);
    }

    const { data: membersBeforePublish } = await admin
      .from("collection_cakes")
      .select("id, library_cake_id, available, sort_order")
      .eq("collection_id", monthly!.id)
      .order("sort_order", { ascending: true });

    const { error: publishErr } = await admin
      .from("collections")
      .update({ status: "active" })
      .eq("id", monthly!.id)
      .eq("status", "draft");
    assert.equal(publishErr, null, publishErr?.message);

    const { data: published } = await admin
      .from("collections")
      .select("id, status, website_override, purpose")
      .eq("id", monthly!.id)
      .maybeSingle();
    assert.equal(published?.status, "active");
    assert.equal(published?.website_override, false);
    assert.equal(published?.purpose, "monthly");

    const { data: membersAfterPublish } = await admin
      .from("collection_cakes")
      .select("id, library_cake_id, available, sort_order")
      .eq("collection_id", monthly!.id)
      .order("sort_order", { ascending: true });
    assert.equal(
      snapshotRows(membersBeforePublish ?? []),
      snapshotRows(membersAfterPublish ?? []),
    );

    const { data: afterMonthlyStorefront } = await admin.rpc(
      "storefront_current_collection",
    );
    assert.equal(
      rowId(afterMonthlyStorefront),
      storefrontId,
      "publishing a future-month monthly catalogue does not replace the current website catalogue",
    );

    const { data: special, error: specialErr } = await admin
      .from("collections")
      .insert({
        name: `${SIG}-SPECIAL`,
        month: null,
        start_date: "2027-01-10",
        end_date: "2027-01-12",
        status: "draft",
        purpose: "special",
        website_override: false,
      })
      .select("id, status, website_override")
      .single();
    assert.equal(specialErr, null, specialErr?.message);
    createdIds.push(special!.id);
    assert.equal(special?.status, "draft");
    assert.equal(special?.website_override, false);

    const { error: specialPublishErr } = await admin
      .from("collections")
      .update({ status: "active" })
      .eq("id", special!.id)
      .eq("status", "draft");
    assert.equal(specialPublishErr, null, specialPublishErr?.message);

    const { data: specialPublished } = await admin
      .from("collections")
      .select("id, status, website_override")
      .eq("id", special!.id)
      .maybeSingle();
    assert.equal(specialPublished?.status, "active");
    assert.equal(
      specialPublished?.website_override,
      false,
      "activating a special catalogue does not set website_override",
    );

    const { data: afterSpecialStorefront } = await admin.rpc(
      "storefront_current_collection",
    );
    assert.equal(
      rowId(afterSpecialStorefront),
      storefrontId,
      "special activation is not the website catalogue",
    );
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

  console.log("PASS library catalogue publish (live)");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
