/**
 * Live catalogue create + special website override.
 * Run: npx tsx scripts/test-library-catalogue-create-live.ts
 *
 * Applies no Product/order writes. Cleans up fixture catalogues.
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
  console.log("SKIP catalogue create live (missing Supabase env)");
  process.exit(0);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SIG = `CATALOGUE-LIVE-${Date.now()}`;

function singaporeYmd(offsetDays = 0): string {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month, day] = formatted.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + offsetDays);
  const shifted = new Date(utc);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function rowId(data: unknown): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  const id = (row as { id?: string } | null)?.id;
  return id ? String(id) : null;
}

async function main() {
  const { data: current, error: currentErr } = await admin.rpc(
    "storefront_current_collection",
  );
  assert.equal(currentErr, null, currentErr?.message);
  const augustId = rowId(current);
  assert.ok(augustId, "storefront has a current monthly catalogue");

  const { count: augustBefore, error: augustCountErr } = await admin
    .from("collection_cakes")
    .select("id", { count: "exact", head: true })
    .eq("collection_id", augustId);
  assert.equal(augustCountErr, null, augustCountErr?.message);

  const { data: probe, error: probeErr } = await admin
    .from("collections")
    .select(
      "id, purpose, month, start_date, end_date, website_override, name, status",
    )
    .eq("id", augustId)
    .maybeSingle();
  if (probeErr?.message.includes("website_override")) {
    console.log(
      "SKIP catalogue create live (apply 20260816180000_catalogue_website_override.sql)",
    );
    process.exit(0);
  }
  if (
    probeErr?.message.includes("start_date") ||
    probeErr?.message.includes("end_date")
  ) {
    console.log(
      "SKIP catalogue create live (apply 20260816170000_catalogue_special_dates.sql)",
    );
    process.exit(0);
  }
  if (probeErr?.message.includes("purpose") || probeErr?.code === "42703") {
    console.log(
      "SKIP catalogue create live (apply 20260816160000_catalogue_purpose.sql)",
    );
    process.exit(0);
  }
  assert.equal(probeErr, null, probeErr?.message);
  assert.equal(probe?.purpose ?? "monthly", "monthly");
  assert.ok(probe?.month, "August monthly catalogue keeps its month identity");
  assert.equal(probe?.start_date ?? null, null);
  assert.equal(probe?.end_date ?? null, null);
  assert.equal(probe?.website_override ?? false, false);

  const today = singaporeYmd(0);
  const yesterday = singaporeYmd(-1);
  const tomorrow = singaporeYmd(1);

  const { data: dateProbe, error: dateProbeErr } = await admin.rpc(
    "storefront_collection_for_date",
    { target_date: today },
  );
  if (
    dateProbeErr?.message.includes("storefront_collection_for_date") ||
    dateProbeErr?.message.includes("Could not find")
  ) {
    console.log(
      "SKIP catalogue create live (apply 20260816180000_catalogue_website_override.sql)",
    );
    process.exit(0);
  }
  assert.equal(dateProbeErr, null, dateProbeErr?.message);
  assert.equal(rowId(dateProbe), augustId);

  const createdIds: string[] = [];
  try {
    const { data: created, error: createErr } = await admin
      .from("collections")
      .insert({
        name: SIG,
        month: null,
        start_date: today,
        end_date: today,
        status: "active",
        purpose: "special",
      })
      .select(
        "id, name, purpose, status, month, start_date, end_date, website_override",
      )
      .single();
    if (createErr) {
      throw new Error(createErr.message);
    }
    createdIds.push(created.id);
    assert.equal(created.purpose, "special");
    assert.equal(created.status, "active");
    assert.equal(created.month, null);
    assert.equal(created.website_override, false);
    assert.equal(String(created.start_date).slice(0, 10), today);
    assert.equal(String(created.end_date).slice(0, 10), today);

    const { count: emptyCount, error: emptyErr } = await admin
      .from("collection_cakes")
      .select("id", { count: "exact", head: true })
      .eq("collection_id", created.id);
    assert.equal(emptyErr, null, emptyErr?.message);
    assert.equal(emptyCount, 0, "new catalogue starts with zero cakes");

    const { data: afterCreateCurrent, error: afterCreateErr } = await admin.rpc(
      "storefront_current_collection",
    );
    assert.equal(afterCreateErr, null, afterCreateErr?.message);
    assert.equal(
      rowId(afterCreateCurrent),
      augustId,
      "special without website_override is not the website catalogue",
    );

    const { data: monthlyCreated, error: monthlyErr } = await admin
      .from("collections")
      .insert({
        name: `${SIG}-MONTHLY`,
        month: "2026-09-01",
        start_date: null,
        end_date: null,
        status: "draft",
        purpose: "monthly",
      })
      .select("id, month, purpose, status, website_override")
      .single();
    assert.equal(monthlyErr, null, monthlyErr?.message);
    createdIds.push(monthlyCreated!.id);
    assert.equal(monthlyCreated?.purpose, "monthly");
    assert.equal(monthlyCreated?.website_override ?? false, false);
    const { count: monthlyEmpty } = await admin
      .from("collection_cakes")
      .select("id", { count: "exact", head: true })
      .eq("collection_id", monthlyCreated!.id);
    assert.equal(monthlyEmpty, 0);

    const { error: onErr } = await admin
      .from("collections")
      .update({ website_override: true })
      .eq("id", created.id);
    assert.equal(onErr, null, onErr?.message);

    const { data: during, error: duringErr } = await admin.rpc(
      "storefront_current_collection",
    );
    assert.equal(duringErr, null, duringErr?.message);
    assert.equal(
      rowId(during),
      created.id,
      "published special covering today becomes the website catalogue",
    );

    const { data: beforeStart, error: beforeErr } = await admin.rpc(
      "storefront_collection_for_date",
      { target_date: yesterday },
    );
    assert.equal(beforeErr, null, beforeErr?.message);
    assert.equal(
      rowId(beforeStart),
      augustId,
      "before start_date the monthly catalogue remains",
    );

    const { data: onStart, error: onStartErr } = await admin.rpc(
      "storefront_collection_for_date",
      { target_date: today },
    );
    assert.equal(onStartErr, null, onStartErr?.message);
    assert.equal(rowId(onStart), created.id);

    const { data: onEnd, error: onEndErr } = await admin.rpc(
      "storefront_collection_for_date",
      { target_date: today },
    );
    assert.equal(onEndErr, null, onEndErr?.message);
    assert.equal(rowId(onEnd), created.id);

    const tomorrowMonth = `${tomorrow.slice(0, 7)}-01`;
    const { data: tomorrowMonthly } = await admin
      .from("collections")
      .select("id")
      .eq("purpose", "monthly")
      .eq("status", "active")
      .eq("month", tomorrowMonth)
      .limit(1);
    const { data: afterEnd, error: afterEndErr } = await admin.rpc(
      "storefront_collection_for_date",
      { target_date: tomorrow },
    );
    assert.equal(afterEndErr, null, afterEndErr?.message);
    assert.equal(
      rowId(afterEnd),
      tomorrowMonthly?.[0]?.id ?? null,
      "the day after end_date uses that date's monthly catalogue, not another month",
    );

    const { data: overlapAttempt, error: overlapErr } = await admin
      .from("collections")
      .insert({
        name: `${SIG}-OVERLAP`,
        month: null,
        start_date: today,
        end_date: today,
        status: "active",
        purpose: "special",
        website_override: true,
      })
      .select("id")
      .single();
    assert.ok(overlapErr, "overlapping published override must be rejected");
    if (overlapAttempt?.id) {
      createdIds.push(overlapAttempt.id);
    }

    const { data: neighbour, error: neighbourErr } = await admin
      .from("collections")
      .insert({
        name: `${SIG}-NEIGHBOUR`,
        month: null,
        start_date: tomorrow,
        end_date: tomorrow,
        status: "active",
        purpose: "special",
        website_override: true,
      })
      .select("id")
      .single();
    assert.equal(neighbourErr, null, neighbourErr?.message);
    createdIds.push(neighbour!.id);

    const { data: neighbourDay, error: neighbourDayErr } = await admin.rpc(
      "storefront_collection_for_date",
      { target_date: tomorrow },
    );
    assert.equal(neighbourDayErr, null, neighbourDayErr?.message);
    assert.equal(rowId(neighbourDay), neighbour!.id);

    const { data: stillToday } = await admin.rpc(
      "storefront_current_collection",
    );
    assert.equal(rowId(stillToday), created.id);

    const { error: offErr } = await admin
      .from("collections")
      .update({ website_override: false })
      .eq("id", created.id);
    assert.equal(offErr, null, offErr?.message);

    const { data: afterOff, error: afterOffErr } = await admin.rpc(
      "storefront_current_collection",
    );
    assert.equal(afterOffErr, null, afterOffErr?.message);
    assert.equal(
      rowId(afterOff),
      augustId,
      "turning website_override off restores the monthly catalogue",
    );

    const { data: augustRow } = await admin
      .from("collections")
      .select("id, name, month, purpose, website_override, status")
      .eq("id", augustId)
      .maybeSingle();
    assert.equal(augustRow?.purpose, "monthly");
    assert.equal(augustRow?.website_override, false);
    assert.equal(
      String(augustRow?.month).slice(0, 10),
      String(probe?.month).slice(0, 10),
    );

    const { count: augustAfter } = await admin
      .from("collection_cakes")
      .select("id", { count: "exact", head: true })
      .eq("collection_id", augustId);
    assert.equal(augustAfter, augustBefore, "August membership unchanged");
  } finally {
    for (const id of [...createdIds].reverse()) {
      await admin.from("collection_cakes").delete().eq("collection_id", id);
      await admin.from("collections").delete().eq("id", id);
    }
  }

  const { count: augustFinal } = await admin
    .from("collection_cakes")
    .select("id", { count: "exact", head: true })
    .eq("collection_id", augustId);
  assert.equal(augustFinal, augustBefore);

  const { data: leftovers } = await admin
    .from("collections")
    .select("id")
    .in("id", createdIds);
  assert.equal((leftovers ?? []).length, 0);

  const { data: restored } = await admin.rpc("storefront_current_collection");
  assert.equal(rowId(restored), augustId);

  console.log("library catalogue create live tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
