/**
 * EXTRA v1.1 — Calendar-assisted proposal live suite.
 *
 * Disposable fixtures only. Unique SIG. Cleanup in finally.
 * Never mutate Product EXTRA rows or the guarded Product preorder.
 *
 * Run: npx tsx scripts/test-extra-calendar-propose-live.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  buildCalendarExtraProposePrefill,
  defaultPreparedOnFromFulfilmentDate,
} from "@/engines/extra/prepared-on-default";
import { isExtraAvailable } from "@/engines/extra/availability";

const PRODUCT_ORDER = "7e9779ac-152b-42e0-8002-34ba8e9b11b5";
const PRODUCT_EXTRA_IDS = [
  "702fbd14-a5af-43e0-a9fb-7947db45a878",
  "9ef2033f-ad2a-4564-bf85-edad0d090f38",
  "dab6207b-b7e6-4106-ba9d-076d606e8bfe",
] as const;

const SIG = `EXTRAV11-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
console.log(`fixture signature SIG=${SIG}`);

const FULFILMENT = "2026-08-17";
const DEFAULT_PREPARED = defaultPreparedOnFromFulfilmentDate(FULFILMENT);
const OVERRIDE_PREPARED = "2026-08-14";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const key = t.slice(0, i).trim();
    const val = t
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exitCode = 1;
  process.exit();
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(ok: boolean, name: string, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
}

const orderIds: string[] = [];
const extraIds: string[] = [];

async function main() {
  try {
    const { data: roles } = await admin.from("roles").select("id, code");
    const roleByCode = new Map((roles ?? []).map((r) => [r.code, r.id]));
    const ownerRoleId = roleByCode.get("owner");
    if (!ownerRoleId) throw new Error("owner role missing");
    const { data: owner } = await admin
      .from("staff_profiles")
      .select("id")
      .eq("role_id", ownerRoleId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (!owner?.id) throw new Error("No owner staff_profiles row");

    const { data: sizes } = await admin
      .from("library_cake_sizes")
      .select("id, cake_id, label, library_cakes!inner(id, name, status)")
      .in("library_cakes.status", ["active", "seasonal"])
      .limit(20);
    if (!sizes || sizes.length < 2) {
      throw new Error("Need at least two library cake sizes");
    }
    const sizeA = sizes[0]!;
    const sizeB =
      sizes.find((s) => s.id !== sizeA.id && s.cake_id !== sizeA.cake_id) ??
      sizes.find((s) => s.id !== sizeA.id) ??
      sizes[1]!;
    function cakeNameOf(row: (typeof sizes)[number]): string {
      const c = row.library_cakes as unknown as
        | { name: string }
        | { name: string }[]
        | null;
      if (Array.isArray(c)) return c[0]?.name ?? "Cake";
      return c?.name ?? "Cake";
    }
    const nameA = cakeNameOf(sizeA);
    const nameB = cakeNameOf(sizeB);

    const { data: productBefore } = await admin
      .from("orders")
      .select("id, status, updated_at, production_started_at, ready_at, picked_up_at")
      .eq("id", PRODUCT_ORDER)
      .maybeSingle();
    check(Boolean(productBefore?.id), "Product order still present");

    const { data: productExtrasBefore } = await admin
      .from("extra_stock")
      .select("id, lifecycle, updated_at, reject_reason")
      .in("id", [...PRODUCT_EXTRA_IDS]);

    const { data: created, error: createErr } = await admin.rpc(
      "create_staff_guest_preorder",
      {
        p_actor_staff_id: owner.id,
        p_customer_name: `${SIG} Multi`,
        p_phone: "0177005111",
        p_email: null,
        p_order_source: "whatsapp",
        p_crew_order: false,
        p_pickup_date: FULFILMENT,
        p_pickup_time: "16:00:00",
        p_pickup_instruction: null,
        p_items: [
          {
            cake_id: sizeA.cake_id,
            cake_size_id: sizeA.id,
            quantity: 2,
          },
          {
            cake_id: sizeB.cake_id,
            cake_size_id: sizeB.id,
            quantity: 1,
          },
        ],
        p_complimentary: [],
        p_include_receipt: false,
        p_needs_bakery_attention: false,
        p_bakery_attention_note: null,
        p_customer_notes: null,
        p_internal_notes: `${SIG} calendar-propose`,
        p_fulfilment_method: "pickup",
        p_delivery: null,
      },
    );
    if (createErr || !created?.id) {
      throw new Error(createErr?.message ?? "create_staff_guest_preorder failed");
    }
    orderIds.push(created.id as string);

    const { data: orderSnap } = await admin
      .from("orders")
      .select(
        "id, pickup_date, status, updated_at, production_started_at, ready_at, picked_up_at, guest_name",
      )
      .eq("id", created.id)
      .single();
    const { data: items } = await admin
      .from("order_items")
      .select("id, cake_id, cake_size_id, cake_name, size_label, quantity")
      .eq("order_id", created.id)
      .order("created_at", { ascending: true });
    if (!orderSnap || !items || items.length < 2) {
      throw new Error("Fixture order/items missing");
    }

    const itemA = items.find((i) => i.cake_size_id === sizeA.id) ?? items[0]!;
    const itemB = items.find((i) => i.cake_size_id === sizeB.id) ?? items[1]!;
    check(itemA.quantity === 2, "fixture item A quantity is 2 (context only)");
    check(
      itemA.cake_id !== itemB.cake_id || itemA.size_label !== itemB.size_label,
      "multi-item order has distinct lines",
    );

    const prefillA = buildCalendarExtraProposePrefill({
      cakeName: itemA.cake_name,
      sizeLabel: itemA.size_label,
      cakeId: itemA.cake_id,
      cakeSizeId: itemA.cake_size_id,
      fulfilmentDateYmd: orderSnap.pickup_date,
    });
    check(
      prefillA.preparedOn === DEFAULT_PREPARED,
      "prepared_on default day-before fulfilment",
      `${orderSnap.pickup_date} -> ${prefillA.preparedOn}`,
    );
    check(
      prefillA.cakeName === itemA.cake_name &&
        prefillA.sizeLabel === itemA.size_label,
      "prefill cake/size snapshots from selected item only",
      `${prefillA.cakeName} ${prefillA.sizeLabel}`,
    );
    check(
      prefillA.libraryCakeId === itemA.cake_id &&
        prefillA.libraryCakeSizeId === itemA.cake_size_id,
      "prefill library IDs from selected item",
    );
    check(
      prefillA.cakeName !== itemB.cake_name ||
        prefillA.sizeLabel !== itemB.size_label,
      "Chocolate-line prefill does not use sibling item",
      `A=${nameA} B=${nameB}`,
    );

    const orderUpdatedBefore = orderSnap.updated_at;
    const { data: proposed, error: proposeErr } = await admin.rpc(
      "propose_extra_stock",
      {
        p_actor_staff_id: owner.id,
        p_cake_name: prefillA.cakeName,
        p_size_label: prefillA.sizeLabel,
        p_prepared_on: OVERRIDE_PREPARED,
        p_note: SIG,
        p_library_cake_id: prefillA.libraryCakeId,
        p_library_cake_size_id: prefillA.libraryCakeSizeId,
      },
    );
    if (proposeErr || !proposed?.id) {
      throw new Error(proposeErr?.message ?? "propose_extra_stock failed");
    }
    extraIds.push(proposed.id as string);

    const { data: extraRow } = await admin
      .from("extra_stock")
      .select(
        "id, lifecycle, cake_name, size_label, prepared_on, pickup_through_at, library_cake_id, library_cake_size_id, note",
      )
      .eq("id", proposed.id)
      .single();

    check(extraRow?.lifecycle === "proposed", "resulting EXTRA lifecycle proposed");
    check(
      extraRow?.prepared_on === OVERRIDE_PREPARED,
      "persisted prepared_on uses edited date",
      extraRow?.prepared_on ?? "",
    );
    check(
      extraRow?.cake_name === itemA.cake_name &&
        extraRow?.size_label === itemA.size_label,
      "EXTRA matches selected item only",
    );
    check(
      !isExtraAvailable({
        lifecycle: (extraRow?.lifecycle ?? "proposed") as "proposed",
        pickupThroughAt: extraRow?.pickup_through_at ?? null,
      }),
      "proposed EXTRA is NOT Available",
    );

    const { count: extraCount } = await admin
      .from("extra_stock")
      .select("id", { count: "exact", head: true })
      .eq("note", SIG);
    check(
      (extraCount ?? 0) === 1,
      "item quantity >1 still creates exactly ONE extra_stock row",
      `count=${extraCount}`,
    );

    const { data: orderAfter } = await admin
      .from("orders")
      .select(
        "id, pickup_date, status, updated_at, production_started_at, ready_at, picked_up_at",
      )
      .eq("id", created.id)
      .single();
    const { data: itemsAfter } = await admin
      .from("order_items")
      .select("id, cake_id, cake_size_id, cake_name, size_label, quantity")
      .eq("order_id", created.id);

    check(
      orderAfter?.updated_at === orderUpdatedBefore,
      "source order updated_at unchanged",
    );
    check(
      orderAfter?.status === orderSnap.status &&
        orderAfter?.pickup_date === orderSnap.pickup_date &&
        orderAfter?.production_started_at == null &&
        orderAfter?.ready_at == null &&
        orderAfter?.picked_up_at == null,
      "source order lifecycle fields unchanged",
    );
    check(
      JSON.stringify(
        (itemsAfter ?? []).map((i) => ({
          id: i.id,
          cake_id: i.cake_id,
          cake_size_id: i.cake_size_id,
          cake_name: i.cake_name,
          size_label: i.size_label,
          quantity: i.quantity,
        })),
      ) ===
        JSON.stringify(
          items.map((i) => ({
            id: i.id,
            cake_id: i.cake_id,
            cake_size_id: i.cake_size_id,
            cake_name: i.cake_name,
            size_label: i.size_label,
            quantity: i.quantity,
          })),
        ),
      "source order items unchanged",
    );

    const { data: proposed2, error: propose2Err } = await admin.rpc(
      "propose_extra_stock",
      {
        p_actor_staff_id: owner.id,
        p_cake_name: prefillA.cakeName,
        p_size_label: prefillA.sizeLabel,
        p_prepared_on: OVERRIDE_PREPARED,
        p_note: SIG,
        p_library_cake_id: prefillA.libraryCakeId,
        p_library_cake_size_id: prefillA.libraryCakeSizeId,
      },
    );
    if (propose2Err || !proposed2?.id) {
      throw new Error(propose2Err?.message ?? "second propose failed");
    }
    extraIds.push(proposed2.id as string);
    check(
      proposed2.id !== proposed.id,
      "duplicate identical proposal allowed (second physical unit)",
    );

    const { data: productAfter } = await admin
      .from("orders")
      .select("id, updated_at")
      .eq("id", PRODUCT_ORDER)
      .maybeSingle();
    check(
      productAfter?.updated_at === productBefore?.updated_at,
      "guarded Product order unchanged",
    );

    const { data: productExtrasAfter } = await admin
      .from("extra_stock")
      .select("id, lifecycle, updated_at, reject_reason")
      .in("id", [...PRODUCT_EXTRA_IDS]);
    const beforeMap = Object.fromEntries(
      (productExtrasBefore ?? []).map((r) => [r.id, r]),
    );
    const extrasOk = PRODUCT_EXTRA_IDS.every((id) => {
      const a = (productExtrasAfter ?? []).find((r) => r.id === id);
      const b = beforeMap[id];
      return (
        a &&
        b &&
        a.lifecycle === b.lifecycle &&
        a.updated_at === b.updated_at &&
        a.reject_reason === b.reject_reason
      );
    });
    check(extrasOk, "Product EXTRA rows unchanged");

    const failed = checks.filter((c) => !c.ok);
    if (failed.length > 0) {
      throw new Error(`${failed.length} check(s) failed`);
    }
    console.log(`\nEXTRA calendar propose live: ${checks.length}/${checks.length} PASS`);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (extraIds.length > 0) {
      await admin.from("extra_stock").delete().in("id", extraIds);
    }
    const { data: leftoverExtras } = await admin
      .from("extra_stock")
      .select("id")
      .or(`note.eq.${SIG},cake_name.ilike.%${SIG}%`);
    for (const row of leftoverExtras ?? []) {
      if (PRODUCT_EXTRA_IDS.includes(row.id as (typeof PRODUCT_EXTRA_IDS)[number])) {
        continue;
      }
      await admin.from("extra_stock").delete().eq("id", row.id);
    }

    for (const id of orderIds) {
      await admin.from("order_items").delete().eq("order_id", id);
      await admin.from("orders").delete().eq("id", id);
    }
    const { data: leftoverOrders } = await admin
      .from("orders")
      .select("id")
      .or(`guest_name.ilike.%${SIG}%,internal_notes.ilike.%${SIG}%`);
    for (const row of leftoverOrders ?? []) {
      if (row.id === PRODUCT_ORDER) continue;
      await admin.from("order_items").delete().eq("order_id", row.id);
      await admin.from("orders").delete().eq("id", row.id);
    }

    const { data: stillExtras } = await admin
      .from("extra_stock")
      .select("id")
      .eq("note", SIG);
    const { data: stillOrders } = await admin
      .from("orders")
      .select("id")
      .or(`guest_name.ilike.%${SIG}%,internal_notes.ilike.%${SIG}%`);
    if ((stillExtras ?? []).length > 0 || (stillOrders ?? []).length > 0) {
      console.error(
        `AUDIT leftovers SIG=${SIG}: extras=${(stillExtras ?? [])
          .map((r) => r.id)
          .join(",")} orders=${(stillOrders ?? []).map((r) => r.id).join(",")}`,
      );
      process.exitCode = 1;
    } else {
      console.log(`Cleanup OK — zero leftovers for SIG=${SIG}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
