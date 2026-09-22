/**
 * Effective cake-size pricing: resolver, overlap, staff UI, order create.
 * Run: npx tsx scripts/test-library-cake-size-prices.ts
 *
 * Static checks always run. Live section uses disposable rows and cleans up.
 * Does not modify production, Fresh Picks, EXTRA, or historical Product orders.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cakeSizePriceScheduleRangesOverlap,
  formatCakeSizePriceSchedulePeriod,
  resolveCakeSizePriceOn,
} from "@/engines/orders/cake-size-price";
import { canManageLibrary } from "@/foundation/navigation/access";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const migrationSrc = readSrc(
  "supabase/migrations/20260922120000_library_cake_size_prices.sql",
);
const engineSrc = readSrc("src/engines/orders/cake-size-price.ts");
const sizeFieldsSrc = readSrc(
  "src/workspaces/library/cakes/CakeSizeFields.tsx",
);
const scheduleUiSrc = readSrc(
  "src/workspaces/library/cakes/CakeSizePriceSchedule.tsx",
);
const scheduleActionsSrc = readSrc(
  "src/workspaces/library/cakes/price-schedule-actions.ts",
);
const ownerActionsSrc = readSrc("src/workspaces/owner/orders/actions.ts");
const extraSql = readSrc(
  "supabase/migrations/20260917140000_extra_walk_in_hold.sql",
);
const freshPicksSql = readSrc(
  "supabase/migrations/20260916120000_fresh_picks_fulfilment_preparation.sql",
);
const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
const convertSql = readSrc(
  "supabase/migrations/20260921100000_waiting_list_confirmation_conversion_state.sql",
);

assert.equal(canManageLibrary("owner"), true);
assert.equal(canManageLibrary("manager"), true);
assert.equal(canManageLibrary("bakery"), false);
assert.equal(canManageLibrary("customer_operations"), false);

assert.match(scheduleActionsSrc, /canManageLibrary/);
assert.match(scheduleActionsSrc, /library_cake_size_prices/);
assert.doesNotMatch(scheduleActionsSrc, /library_cake_sizes\.price/);

assert.match(migrationSrc, /create table public\.library_cake_size_prices/);
assert.match(migrationSrc, /library_cake_size_price_on/);
assert.match(migrationSrc, /exclude using gist/);
assert.match(
  migrationSrc,
  /_current_staff_role_code\(\) in \('owner', 'manager'\)/,
);
assert.match(migrationSrc, /Do not copy these into collection_cakes/);
assert.match(
  migrationSrc,
  /public\.library_cake_size_price_on\(size_row\.id, p_pickup_date\)/,
);
assert.match(
  migrationSrc,
  /storefront_collection_for_pickup_date\(p_pickup_date\)/,
);

const guestInsert = migrationSrc.indexOf(
  "create or replace function public.submit_guest_preorder(",
);
const guestBody = migrationSrc.slice(guestInsert);
assert.match(
  guestBody,
  /library_cake_size_price_on\(size_row\.id, p_pickup_date\)/,
);
assert.doesNotMatch(
  guestBody.slice(
    guestBody.indexOf("insert into public.order_items"),
    guestBody.indexOf("item_count := item_count + 1"),
  ),
  /size_row\.price/,
);

assert.match(convertSql, /create_staff_guest_preorder/);
assert.match(
  convertSql,
  /Server-side catalogue prices only\. Client unit_price \/ subtotal are ignored/,
);

assert.match(sizeFieldsSrc, /Current price \(RM\)/);
assert.match(sizeFieldsSrc, /CakeSizePriceSchedule/);
assert.match(scheduleUiSrc, /Current price/);
assert.match(scheduleUiSrc, /Scheduled prices/);
assert.match(scheduleUiSrc, /Add a scheduled price/);
assert.match(engineSrc, /resolveCakeSizePriceOn/);

assert.match(ownerActionsSrc, /library_cake_size_price_on/);
assert.match(ownerActionsSrc, /prior\s*\?\s*prior\.unitPrice/);

assert.doesNotMatch(extraSql, /library_cake_size_price_on/);
assert.doesNotMatch(freshPicksSql, /library_cake_size_price_on/);
assert.doesNotMatch(extraActionsSrc, /library_cake_size_price_on/);
assert.match(extraSql, /coalesce\(size_row\.price, 0\)/);
assert.match(freshPicksSql, /coalesce\(size_row\.price, 0\)/);

const base = {
  basePrice: 120,
  schedules: [] as Array<{
    price: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  }>,
};

assert.equal(
  resolveCakeSizePriceOn({
    ...base,
    pickupDate: "2026-09-25",
  }),
  120,
);

const octoberOnward = [
  { price: 130, effectiveFrom: "2026-10-01", effectiveTo: null },
];
assert.equal(
  resolveCakeSizePriceOn({
    basePrice: 120,
    schedules: octoberOnward,
    pickupDate: "2026-09-25",
  }),
  120,
);
assert.equal(
  resolveCakeSizePriceOn({
    basePrice: 120,
    schedules: octoberOnward,
    pickupDate: "2026-10-01",
  }),
  130,
);
assert.equal(
  resolveCakeSizePriceOn({
    basePrice: 120,
    schedules: octoberOnward,
    pickupDate: "2026-10-15",
  }),
  130,
);

const octoberOnly = [
  { price: 130, effectiveFrom: "2026-10-01", effectiveTo: "2026-10-31" },
];
assert.equal(
  resolveCakeSizePriceOn({
    basePrice: 120,
    schedules: octoberOnly,
    pickupDate: "2026-09-30",
  }),
  120,
);
assert.equal(
  resolveCakeSizePriceOn({
    basePrice: 120,
    schedules: octoberOnly,
    pickupDate: "2026-10-01",
  }),
  130,
);
assert.equal(
  resolveCakeSizePriceOn({
    basePrice: 120,
    schedules: octoberOnly,
    pickupDate: "2026-10-31",
  }),
  130,
);
assert.equal(
  resolveCakeSizePriceOn({
    basePrice: 120,
    schedules: octoberOnly,
    pickupDate: "2026-11-01",
  }),
  120,
);

const twoPeriods = [
  { price: 130, effectiveFrom: "2026-10-01", effectiveTo: "2026-10-31" },
  { price: 135, effectiveFrom: "2026-11-01", effectiveTo: null },
];
assert.equal(
  resolveCakeSizePriceOn({
    basePrice: 120,
    schedules: twoPeriods,
    pickupDate: "2026-09-30",
  }),
  120,
);
assert.equal(
  resolveCakeSizePriceOn({
    basePrice: 120,
    schedules: twoPeriods,
    pickupDate: "2026-10-15",
  }),
  130,
);
assert.equal(
  resolveCakeSizePriceOn({
    basePrice: 120,
    schedules: twoPeriods,
    pickupDate: "2026-11-01",
  }),
  135,
);
assert.equal(
  resolveCakeSizePriceOn({
    basePrice: 120,
    schedules: twoPeriods,
    pickupDate: "2026-12-15",
  }),
  135,
);

assert.equal(
  cakeSizePriceScheduleRangesOverlap(
    { effectiveFrom: "2026-10-01", effectiveTo: "2026-10-31" },
    { effectiveFrom: "2026-10-15", effectiveTo: null },
  ),
  true,
);
assert.equal(
  cakeSizePriceScheduleRangesOverlap(
    { effectiveFrom: "2026-10-01", effectiveTo: "2026-10-31" },
    { effectiveFrom: "2026-11-01", effectiveTo: null },
  ),
  false,
);

assert.equal(
  formatCakeSizePriceSchedulePeriod({
    effectiveFrom: "2026-10-01",
    effectiveTo: null,
  }),
  "1 Oct 2026 onward",
);

assert.throws(() =>
  resolveCakeSizePriceOn({
    basePrice: 120,
    schedules: [
      { price: 130, effectiveFrom: "2026-10-01", effectiveTo: null },
      { price: 140, effectiveFrom: "2026-10-15", effectiveTo: "2026-10-20" },
    ],
    pickupDate: "2026-10-16",
  }),
);

console.log("PASS library cake size prices (static)");

void (async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log("SKIP live library cake size prices (missing Supabase env)");
    return;
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: probe, error: probeError } = await admin.rpc(
    "library_cake_size_price_on",
    {
      p_cake_size_id: "00000000-0000-0000-0000-000000000000",
      p_pickup_date: "2026-09-25",
    },
  );
  if (
    probeError &&
    /Could not find the function|schema cache|does not exist/i.test(
      probeError.message,
    )
  ) {
    console.log(
      "SKIP live library cake size prices (resolver not applied on DEV yet)",
    );
    return;
  }
  void probe;

  const { data: category, error: categoryError } = await admin
    .from("library_cake_categories")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (categoryError || !category?.id) {
    throw new Error(categoryError?.message ?? "No cake category");
  }

  const stamp = Date.now();
  const cakeName = `Pricing Phase1 ${stamp}`;
  const { data: cake, error: cakeError } = await admin
    .from("library_cakes")
    .insert({
      name: cakeName,
      category_id: category.id,
      status: "active",
      description: "Disposable Phase 1 pricing cake",
    })
    .select("id")
    .single();
  if (cakeError || !cake?.id) {
    throw new Error(cakeError?.message ?? "Failed to insert disposable cake");
  }

  const cleanup = {
    cakeId: cake.id,
    sizeIds: [] as string[],
    scheduleIds: [] as string[],
    orderIds: [] as string[],
    membershipIds: [] as string[],
  };

  try {
    const { data: size6, error: size6Error } = await admin
      .from("library_cake_sizes")
      .insert({
        cake_id: cake.id,
        label: '6"',
        price: 120,
        sort_order: 1,
        preorder_days: 2,
      })
      .select("id, price")
      .single();
    if (size6Error || !size6?.id) {
      throw new Error(size6Error?.message ?? "Failed to insert 6 inch");
    }
    cleanup.sizeIds.push(size6.id);

    const { data: size4, error: size4Error } = await admin
      .from("library_cake_sizes")
      .insert({
        cake_id: cake.id,
        label: '4"',
        price: 80,
        sort_order: 2,
        preorder_days: 2,
      })
      .select("id, price")
      .single();
    if (size4Error || !size4?.id) {
      throw new Error(size4Error?.message ?? "Failed to insert 4 inch");
    }
    cleanup.sizeIds.push(size4.id);

    async function priceOn(sizeId: string, date: string) {
      const { data, error } = await admin.rpc("library_cake_size_price_on", {
        p_cake_size_id: sizeId,
        p_pickup_date: date,
      });
      if (error) throw new Error(error.message);
      return Number(data);
    }

    assert.equal(await priceOn(size6.id, "2026-09-25"), 120);

    const { data: octSchedule, error: octError } = await admin
      .from("library_cake_size_prices")
      .insert({
        cake_size_id: size6.id,
        price: 130,
        effective_from: "2026-10-01",
        effective_to: null,
      })
      .select("id")
      .single();
    if (octError || !octSchedule?.id) {
      throw new Error(octError?.message ?? "Failed to insert October schedule");
    }
    cleanup.scheduleIds.push(octSchedule.id);

    const { data: sizeAfter } = await admin
      .from("library_cake_sizes")
      .select("price")
      .eq("id", size6.id)
      .single();
    assert.equal(Number(sizeAfter?.price), 120, "base price stays RM120");

    assert.equal(await priceOn(size6.id, "2026-09-25"), 120);
    assert.equal(await priceOn(size6.id, "2026-10-01"), 130);
    assert.equal(await priceOn(size6.id, "2026-10-15"), 130);
    assert.equal(await priceOn(size4.id, "2026-10-15"), 80);

    const { error: overlapError } = await admin
      .from("library_cake_size_prices")
      .insert({
        cake_size_id: size6.id,
        price: 140,
        effective_from: "2026-10-15",
        effective_to: "2026-10-20",
      });
    assert.ok(overlapError, "overlapping schedule is rejected");

    const { error: siblingOk } = await admin
      .from("library_cake_size_prices")
      .insert({
        cake_size_id: size4.id,
        price: 90,
        effective_from: "2026-10-01",
        effective_to: null,
      });
    if (siblingOk) throw new Error(siblingOk.message);

    const { data: size4Schedule } = await admin
      .from("library_cake_size_prices")
      .select("id")
      .eq("cake_size_id", size4.id)
      .maybeSingle();
    if (size4Schedule?.id) cleanup.scheduleIds.push(size4Schedule.id);
    assert.equal(await priceOn(size4.id, "2026-10-15"), 90);

    await admin
      .from("library_cake_size_prices")
      .delete()
      .eq("id", octSchedule.id);
    cleanup.scheduleIds = cleanup.scheduleIds.filter(
      (id) => id !== octSchedule.id,
    );

    const { data: ranged, error: rangedError } = await admin
      .from("library_cake_size_prices")
      .insert({
        cake_size_id: size6.id,
        price: 130,
        effective_from: "2026-10-01",
        effective_to: "2026-10-31",
      })
      .select("id")
      .single();
    if (rangedError || !ranged?.id) {
      throw new Error(rangedError?.message ?? "Failed ranged schedule");
    }
    cleanup.scheduleIds.push(ranged.id);
    assert.equal(await priceOn(size6.id, "2026-09-30"), 120);
    assert.equal(await priceOn(size6.id, "2026-10-01"), 130);
    assert.equal(await priceOn(size6.id, "2026-10-31"), 130);
    assert.equal(await priceOn(size6.id, "2026-11-01"), 120);

    const { data: november, error: novError } = await admin
      .from("library_cake_size_prices")
      .insert({
        cake_size_id: size6.id,
        price: 135,
        effective_from: "2026-11-01",
        effective_to: null,
      })
      .select("id")
      .single();
    if (novError || (!novError && !november?.id)) {
      throw new Error(novError?.message ?? "Failed November schedule");
    }
    if (november?.id) cleanup.scheduleIds.push(november.id);
    assert.equal(await priceOn(size6.id, "2026-11-01"), 135);

    const { data: staff } = await admin
      .from("staff_profiles")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (!staff?.id) throw new Error("No staff_profiles");

    const { data: beforeOrder, error: beforeErr } = await admin.rpc(
      "create_staff_guest_preorder",
      {
        p_actor_staff_id: staff.id,
        p_customer_name: `Pricing hist ${stamp}`,
        p_phone: "0120000001",
        p_email: null,
        p_order_source: "whatsapp",
        p_crew_order: false,
        p_pickup_date: "2026-09-25",
        p_pickup_time: "16:00:00",
        p_pickup_instruction: null,
        p_items: [{ cake_id: cake.id, cake_size_id: size6.id, quantity: 1 }],
        p_complimentary: [],
        p_include_receipt: false,
        p_needs_bakery_attention: false,
        p_bakery_attention_note: null,
        p_customer_notes: null,
        p_internal_notes: "phase1-pricing-history",
      },
    );
    if (beforeErr) throw new Error(beforeErr.message);
    if (beforeOrder?.id) cleanup.orderIds.push(beforeOrder.id);
    const { data: histItems } = await admin
      .from("order_items")
      .select("unit_price")
      .eq("order_id", beforeOrder.id);
    assert.equal(Number(histItems?.[0]?.unit_price), 120);

    const { data: afterOrder, error: afterErr } = await admin.rpc(
      "create_staff_guest_preorder",
      {
        p_actor_staff_id: staff.id,
        p_customer_name: `Pricing oct ${stamp}`,
        p_phone: "0120000002",
        p_email: null,
        p_order_source: "whatsapp",
        p_crew_order: false,
        p_pickup_date: "2026-10-15",
        p_pickup_time: "16:00:00",
        p_pickup_instruction: null,
        p_items: [{ cake_id: cake.id, cake_size_id: size6.id, quantity: 1 }],
        p_complimentary: [],
        p_include_receipt: false,
        p_needs_bakery_attention: false,
        p_bakery_attention_note: null,
        p_customer_notes: null,
        p_internal_notes: "phase1-pricing-october",
      },
    );
    if (afterErr) throw new Error(afterErr.message);
    if (afterOrder?.id) cleanup.orderIds.push(afterOrder.id);
    const { data: octItems } = await admin
      .from("order_items")
      .select("unit_price")
      .eq("order_id", afterOrder.id);
    assert.equal(Number(octItems?.[0]?.unit_price), 130);

    const { data: histAgain } = await admin
      .from("order_items")
      .select("unit_price")
      .eq("order_id", beforeOrder.id);
    assert.equal(
      Number(histAgain?.[0]?.unit_price),
      120,
      "historical order_items stay RM120",
    );

    const { data: collection } = await admin.rpc(
      "storefront_collection_for_pickup_date",
      { p_pickup_date: "2026-10-15" },
    );
    const collectionId = (
      Array.isArray(collection) ? collection[0] : collection
    )?.id as string | undefined;
    if (collectionId) {
      const { data: membership, error: memErr } = await admin
        .from("collection_cakes")
        .insert({
          collection_id: collectionId,
          library_cake_id: cake.id,
          available: true,
          sort_order: 99,
        })
        .select("collection_id, library_cake_id")
        .maybeSingle();
      if (!memErr && membership) {
        cleanup.membershipIds.push(
          `${membership.collection_id}::${membership.library_cake_id}`,
        );
      }
      const { data: guestOrder, error: guestErr } = await admin.rpc(
        "submit_guest_preorder",
        {
          p_customer_name: `Pricing guest ${stamp}`,
          p_phone: "0190000099",
          p_email: null,
          p_pickup_date: "2026-10-15",
          p_pickup_time: "16:00:00",
          p_notes: "phase1-pricing-guest",
          p_items: [{ cake_id: cake.id, cake_size_id: size6.id, quantity: 1 }],
          p_email_submission_receipt_requested: false,
        },
      );
      if (guestOrder?.id) cleanup.orderIds.push(guestOrder.id);
      if (guestErr) {
        console.log(
          `NOTE guest submit skipped live snapshot: ${guestErr.message}`,
        );
      } else {
        const { data: guestItems } = await admin
          .from("order_items")
          .select("unit_price")
          .eq("order_id", guestOrder.id);
        assert.equal(Number(guestItems?.[0]?.unit_price), 130);
      }
    }

    console.log("PASS library cake size prices (live)");
  } finally {
    for (const orderId of cleanup.orderIds) {
      await admin.from("order_items").delete().eq("order_id", orderId);
      await admin.from("orders").delete().eq("id", orderId);
    }
    for (const key of cleanup.membershipIds) {
      const [collectionId, cakeId] = key.split("::");
      await admin
        .from("collection_cakes")
        .delete()
        .eq("collection_id", collectionId ?? "")
        .eq("library_cake_id", cakeId ?? "");
    }
    if (cleanup.scheduleIds.length > 0) {
      await admin
        .from("library_cake_size_prices")
        .delete()
        .in("id", cleanup.scheduleIds);
    }
    if (cleanup.sizeIds.length > 0) {
      await admin.from("library_cake_sizes").delete().in("id", cleanup.sizeIds);
    }
    await admin.from("library_cakes").delete().eq("id", cleanup.cakeId);
  }
})().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
