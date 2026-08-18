/**
 * Fresh Picks Extra — live RPCs for pickup-from, order cutoff, sold-out, Extra order.
 * Run: npx tsx scripts/test-extra-fresh-picks-live.ts
 *
 * Disposable Extra (+ Extra-order) fixtures only. Cleanup always.
 * Does not mutate Product order 7e9779ac-… or Library cakes.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { isPublishedFreshPick } from "@/engines/extra/customer-fresh-picks";
import {
  extraCustomerPickupSlotsForDate,
  isValidExtraCustomerPickup,
} from "@/engines/extra/extra-pickup";
import {
  defaultExtraOrderCutoffSlot,
  defaultExtraPickupFromSlot,
  extraOperatingSlotsForDate,
  extraOrderCutoffSlotsForDate,
  extraPickupThroughIso,
} from "@/engines/extra/fresh-picks-eligibility";
import { addBusinessCalendarDays, toBusinessDateKey } from "@/lib/dates";

const PRODUCT_ORDER_ID = "7e9779ac-152b-42e0-8002-34ba8e9b11b5";
const MIGRATION_HINT =
  "BLOCKED: apply supabase/migrations/20260817140000_extra_pickup_from_order_cutoff.sql in the Supabase SQL Editor, then re-run this test.";

class MigrationBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationBlockedError";
  }
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
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const SIG = `FPICK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
console.log(`fixture signature SIG=${SIG}`);

type Check = { label: string; ok: boolean; detail?: string };

function rpcMessage(error: { message?: string } | null | undefined): string {
  return error?.message ?? "";
}

function pastCutoffSlot(ymd: string, now: Date): string | null {
  for (const slot of extraOrderCutoffSlotsForDate({
    cutoffDate: ymd,
    todayYmd: ymd,
    now,
  })) {
    if (slot.disabled) return slot.value;
  }
  return null;
}

function pastConfirmedCutoffWindow(
  todayYmd: string,
  now: Date,
): { fromIso: string; throughIso: string } | null {
  const pastToday = extraOperatingSlotsForDate(todayYmd).filter((slot) => {
    const iso = extraPickupThroughIso(todayYmd, slot.value);
    return Boolean(iso && Date.parse(iso) < now.getTime());
  });
  if (pastToday.length > 0) {
    const through = pastToday[pastToday.length - 1]?.value;
    const from = pastToday[0]?.value;
    const fromIso = from ? extraPickupThroughIso(todayYmd, from) : null;
    const throughIso = through
      ? extraPickupThroughIso(todayYmd, through)
      : null;
    if (fromIso && throughIso) return { fromIso, throughIso };
  }
  const yesterday = addBusinessCalendarDays(todayYmd, -1);
  if (!yesterday) return null;
  const ySlots = extraOperatingSlotsForDate(yesterday);
  const from = ySlots[0]?.value;
  const through = ySlots.at(-1)?.value;
  const fromIso = from ? extraPickupThroughIso(yesterday, from) : null;
  const throughIso = through ? extraPickupThroughIso(yesterday, through) : null;
  if (!fromIso || !throughIso) return null;
  if (Date.parse(throughIso) >= now.getTime()) return null;
  return { fromIso, throughIso };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log("SKIP live DB (missing Supabase env).");
    return;
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const checks: Check[] = [];
  const extraIds: string[] = [];
  const extraOrderIds: string[] = [];
  let migrationBlocked = false;

  function check(ok: boolean, label: string, detail?: string) {
    checks.push({ label, ok, detail });
    console.log(
      `${ok ? "PASS" : "FAIL"} — ${label}${detail ? `: ${detail}` : ""}`,
    );
  }

  async function cleanupExtras() {
    if (extraOrderIds.length > 0) {
      await admin.from("orders").delete().in("id", extraOrderIds);
    }
    const leftoverQuery = await admin
      .from("extra_stock")
      .select("id")
      .or(`note.eq.${SIG},cake_name.ilike.%${SIG}%`);
    const leftoverIds = [
      ...extraIds,
      ...((leftoverQuery.data ?? []).map((row) => row.id as string)),
    ];
    const uniqueExtraIds = [...new Set(leftoverIds)];
    if (uniqueExtraIds.length > 0) {
      const { data: leftoverOrders } = await admin
        .from("orders")
        .select("id")
        .in("extra_stock_id", uniqueExtraIds);
      const orderIds = (leftoverOrders ?? []).map((row) => row.id as string);
      if (orderIds.length > 0) {
        await admin.from("orders").delete().in("id", orderIds);
      }
      await admin.from("extra_stock").delete().in("id", uniqueExtraIds);
    }
    const namedOrders = await admin
      .from("orders")
      .select("id")
      .ilike("guest_name", `%${SIG}%`);
    const namedIds = (namedOrders.data ?? []).map((row) => row.id as string);
    if (namedIds.length > 0) {
      await admin.from("orders").delete().in("id", namedIds);
    }
  }

  try {
    const probe = await admin.rpc("submit_guest_extra_order", {
      p_customer_name: "Probe",
      p_phone: "000",
      p_email: null,
      p_pickup_date: toBusinessDateKey(),
      p_pickup_time: "12:00",
      p_notes: SIG,
      p_extra_stock_id: "00000000-0000-0000-0000-000000000000",
    });
    if (probe.error?.message?.includes("Could not find the function")) {
      throw new MigrationBlockedError(MIGRATION_HINT);
    }

    const { data: roles } = await admin.from("roles").select("id, code");
    const roleByCode = new Map((roles ?? []).map((r) => [r.code, r.id]));

    async function activeStaffForRole(code: string) {
      const roleId = roleByCode.get(code);
      if (!roleId) return null;
      const { data } = await admin
        .from("staff_profiles")
        .select("id")
        .eq("role_id", roleId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      return data;
    }

    const bakery = await activeStaffForRole("bakery");
    const manager = await activeStaffForRole("manager");
    const owner = await activeStaffForRole("owner");
    const actor = bakery ?? manager ?? owner;
    if (!actor?.id) throw new Error("No bakery-capable staff_profiles row");

    const { data: cake } = await admin
      .from("library_cakes")
      .select("id, name, library_cake_sizes ( id, label )")
      .in("status", ["active", "seasonal"])
      .limit(1)
      .maybeSingle();
    type SizeEmbed = { id: string; label: string };
    const sizes = (cake?.library_cake_sizes ?? []) as SizeEmbed[];
    const size = sizes[0];
    if (!cake?.id || !size?.id) throw new Error("Need an active Library cake/size");

    const { data: productBefore } = await admin
      .from("orders")
      .select("id, status, ready_at, picked_up_at, production_started_at")
      .eq("id", PRODUCT_ORDER_ID)
      .maybeSingle();

    const tomorrowProbeDate = addBusinessCalendarDays(toBusinessDateKey(), 1);
    const { data: catalogueBefore } = await admin.rpc(
      "storefront_collection_for_pickup_date",
      { p_pickup_date: tomorrowProbeDate },
    );

    const todayYmd = toBusinessDateKey();
    const tomorrowYmd = addBusinessCalendarDays(todayYmd, 1);
    if (!tomorrowYmd) throw new Error("tomorrow missing");
    const now = new Date();
    const todayFrom =
      defaultExtraPickupFromSlot({
        pickupFromDate: todayYmd,
        todayYmd,
        now,
      }) ?? extraOperatingSlotsForDate(todayYmd)[0]?.value;
    const todayCutoff = defaultExtraOrderCutoffSlot({
      cutoffDate: todayYmd,
      todayYmd,
      now,
    });
    const tomorrowFrom =
      defaultExtraPickupFromSlot({
        pickupFromDate: tomorrowYmd,
        todayYmd,
        now,
      }) ?? "12:00";
    const tomorrowCutoff =
      defaultExtraOrderCutoffSlot({
        cutoffDate: tomorrowYmd,
        todayYmd,
        now,
      }) ?? extraOperatingSlotsForDate(tomorrowYmd).at(-1)?.value ?? "17:30";

    async function proposeNamed(name: string, preparedOn: string) {
      const { data, error } = await admin.rpc("propose_extra_stock", {
        p_actor_staff_id: actor.id,
        p_cake_name: `${name} ${SIG}`,
        p_size_label: size.label,
        p_prepared_on: preparedOn,
        p_note: SIG,
        p_library_cake_id: cake.id,
        p_library_cake_size_id: size.id,
      });
      const id = data?.id as string | undefined;
      if (id) extraIds.push(id);
      return { id, error };
    }

    if (todayFrom && todayCutoff) {
      const proposed = await proposeNamed("LiveNow", todayYmd);
      check(!proposed.error, "A propose live Extra", rpcMessage(proposed.error));
      const fromIso = extraPickupThroughIso(todayYmd, todayFrom);
      const throughIso = extraPickupThroughIso(todayYmd, todayCutoff);
      const { data: confirmed, error: cErr } = await admin.rpc(
        "confirm_extra_stock",
        {
          p_extra_stock_id: proposed.id,
          p_actor_staff_id: actor.id,
          p_prepared_on: todayYmd,
          p_pickup_available_from_at: fromIso,
          p_pickup_through_at: throughIso,
        },
      );
      check(!cErr, "A confirm live Extra", rpcMessage(cErr));
      check(confirmed?.lifecycle === "confirmed", "A lifecycle confirmed");
      const confirmedAt = String(confirmed?.confirmed_at ?? "");
      const visibilityNow = new Date(confirmedAt);
      check(
        isPublishedFreshPick({
          lifecycle: "confirmed",
          confirmedAt,
          pickupThroughAt: throughIso,
          soldAt: null,
          now: visibilityNow,
        }),
        "A customer sees Extra immediately",
      );

      const { data: undone, error: uErr } = await admin.rpc(
        "unconfirm_extra_stock",
        {
          p_extra_stock_id: proposed.id,
          p_actor_staff_id: actor.id,
        },
      );
      check(!uErr, "H undo unsold confirmed Extra", rpcMessage(uErr));
      check(undone?.lifecycle === "proposed", "H undo returns proposed");
      check(undone?.pickup_through_at == null, "H undo clears order cutoff");
      check(
        undone?.pickup_available_from_at == null,
        "H undo clears pickup-from",
      );
    } else {
      check(true, "A today confirm (SKIP — no remaining today cutoff)");
      check(true, "H undo (SKIP — no today confirm)");
    }

    if (todayFrom && todayCutoff && todayFrom < todayCutoff) {
      const laterFrom =
        extraOperatingSlotsForDate(todayYmd).find((s) => s.value > todayFrom)
          ?.value ?? todayCutoff;
      const proposed = await proposeNamed("LaterPickup", todayYmd);
      const { error: cErr } = await admin.rpc("confirm_extra_stock", {
        p_extra_stock_id: proposed.id,
        p_actor_staff_id: actor.id,
        p_prepared_on: todayYmd,
        p_pickup_available_from_at: extraPickupThroughIso(todayYmd, laterFrom),
        p_pickup_through_at: extraPickupThroughIso(todayYmd, todayCutoff),
      });
      check(!cErr, "B pickup-from later than posting", rpcMessage(cErr));
      if (!cErr) {
        await admin.rpc("unconfirm_extra_stock", {
          p_extra_stock_id: proposed.id,
          p_actor_staff_id: actor.id,
        });
      }
    } else {
      check(true, "B later pickup-from (SKIP)");
    }

    if (todayFrom) {
      const proposed = await proposeNamed("CrossDay", todayYmd);
      const { error } = await admin.rpc("confirm_extra_stock", {
        p_extra_stock_id: proposed.id,
        p_actor_staff_id: actor.id,
        p_prepared_on: todayYmd,
        p_pickup_available_from_at: extraPickupThroughIso(todayYmd, todayFrom),
        p_pickup_through_at: extraPickupThroughIso(tomorrowYmd, tomorrowCutoff),
      });
      check(!error, "C cross-day order cutoff confirm", rpcMessage(error));
      if (!error) {
        await admin.rpc("unconfirm_extra_stock", {
          p_extra_stock_id: proposed.id,
          p_actor_staff_id: actor.id,
        });
      }
    }

    const pastWindow = pastConfirmedCutoffWindow(todayYmd, new Date());
    if (todayFrom && todayCutoff && pastWindow) {
      const proposed = await proposeNamed("PastCutoff", todayYmd);
      await admin.rpc("confirm_extra_stock", {
        p_extra_stock_id: proposed.id,
        p_actor_staff_id: actor.id,
        p_prepared_on: todayYmd,
        p_pickup_available_from_at: extraPickupThroughIso(todayYmd, todayFrom),
        p_pickup_through_at: extraPickupThroughIso(todayYmd, todayCutoff),
      });
      const { error: windowErr } = await admin
        .from("extra_stock")
        .update({
          pickup_available_from_at: pastWindow.fromIso,
          pickup_through_at: pastWindow.throughIso,
        })
        .eq("id", proposed.id)
        .eq("lifecycle", "confirmed")
        .is("sold_at", null);
      check(
        !windowErr,
        "D past-cutoff fixture window applied",
        rpcMessage(windowErr),
      );
      const { error } = await admin.rpc("submit_guest_extra_order", {
        p_customer_name: `Cutoff ${SIG}`,
        p_phone: "6590000001",
        p_email: null,
        p_pickup_date: todayYmd,
        p_pickup_time: todayCutoff,
        p_notes: SIG,
        p_extra_stock_id: proposed.id,
      });
      check(Boolean(error), "D new order rejected after cutoff", rpcMessage(error));
      await admin.rpc("unconfirm_extra_stock", {
        p_extra_stock_id: proposed.id,
        p_actor_staff_id: actor.id,
      });
    } else {
      check(true, "D new order rejected after cutoff (SKIP — no past operating slot)");
    }

    const pastSlot = pastCutoffSlot(todayYmd, now);
    if (pastSlot && todayFrom) {
      const proposed = await proposeNamed("InvalidPast", todayYmd);
      const { error } = await admin.rpc("confirm_extra_stock", {
        p_extra_stock_id: proposed.id,
        p_actor_staff_id: actor.id,
        p_prepared_on: todayYmd,
        p_pickup_available_from_at: extraPickupThroughIso(todayYmd, todayFrom),
        p_pickup_through_at: extraPickupThroughIso(todayYmd, pastSlot),
      });
      check(Boolean(error), "invalid/past cutoff rejected at confirm", rpcMessage(error));
    } else {
      check(true, "invalid/past cutoff rejected (SKIP — none yet today)");
    }

    {
      const future = addBusinessCalendarDays(todayYmd, 2);
      if (future) {
        const proposed = await proposeNamed(`Future ${future}`, future);
        const { error } = await admin.rpc("confirm_extra_stock", {
          p_extra_stock_id: proposed.id,
          p_actor_staff_id: actor.id,
          p_prepared_on: future,
          p_pickup_available_from_at: extraPickupThroughIso(future, "12:00"),
          p_pickup_through_at: extraPickupThroughIso(future, "14:00"),
        });
        check(Boolean(error), "invalid future horizon rejected", rpcMessage(error));
      }
    }

    const orderFromDate = todayCutoff ? todayYmd : tomorrowYmd;
    const orderFrom =
      (orderFromDate === todayYmd ? todayFrom : tomorrowFrom) ?? "12:00";
    const orderCutoff =
      (orderFromDate === todayYmd ? todayCutoff : tomorrowCutoff) ?? "17:30";
    const orderFromIso = extraPickupThroughIso(orderFromDate, orderFrom);
    const orderCutoffIso = extraPickupThroughIso(orderFromDate, orderCutoff);
    const remainingSlots = extraCustomerPickupSlotsForDate(
      orderFromDate,
      { pickupAvailableFromAt: orderFromIso!, orderCutoffAt: orderCutoffIso! },
      now,
    );
    const pickupAfterCutoff = remainingSlots.filter((slot) => {
      const iso = extraPickupThroughIso(orderFromDate, slot.value);
      return iso != null && Date.parse(iso) > Date.parse(orderCutoffIso!);
    });
    const pickupSlot = pickupAfterCutoff.at(-1)?.value ?? remainingSlots.at(-1)?.value;

    if (pickupSlot && orderFromIso && orderCutoffIso) {
      check(
        isValidExtraCustomerPickup({
          pickupDate: orderFromDate,
          pickupTime: pickupSlot,
          pickupAvailableFromAt: orderFromIso,
          orderCutoffAt: orderCutoffIso,
          now,
        }),
        "E pickup slot valid independent of cutoff truncation",
      );
      const proposed = await proposeNamed("SellMe", orderFromDate);
      const { error: cErr } = await admin.rpc("confirm_extra_stock", {
        p_extra_stock_id: proposed.id,
        p_actor_staff_id: actor.id,
        p_prepared_on: orderFromDate,
        p_pickup_available_from_at: orderFromIso,
        p_pickup_through_at: orderCutoffIso,
      });
      check(!cErr, "E/F confirm Extra for order", rpcMessage(cErr));
      const { data: order, error: oErr } = await admin.rpc(
        "submit_guest_extra_order",
        {
          p_customer_name: `Guest ${SIG}`,
          p_phone: "6590000002",
          p_email: null,
          p_pickup_date: orderFromDate,
          p_pickup_time: pickupSlot,
          p_notes: SIG,
          p_extra_stock_id: proposed.id,
        },
      );
      check(!oErr, "E Extra order accepted", rpcMessage(oErr));
      if (order?.id) extraOrderIds.push(order.id as string);
      check(order?.collection_id == null, "E Extra order has no catalogue collection");

      const { data: soldRow } = await admin
        .from("extra_stock")
        .select("sold_at, lifecycle, pickup_through_at")
        .eq("id", proposed.id)
        .maybeSingle();
      check(Boolean(soldRow?.sold_at), "F sold_at stamped");
      check(soldRow?.lifecycle === "confirmed", "F sold Extra stays confirmed");
      check(
        !isPublishedFreshPick({
          lifecycle: "confirmed",
          pickupThroughAt: soldRow?.pickup_through_at ?? null,
          soldAt: soldRow?.sold_at ?? null,
          now,
        }),
        "F sold Extra disappears from Fresh Picks",
      );

      const { error: dupErr } = await admin.rpc("submit_guest_extra_order", {
        p_customer_name: `Dup ${SIG}`,
        p_phone: "6590000003",
        p_email: null,
        p_pickup_date: orderFromDate,
        p_pickup_time: pickupSlot,
        p_notes: SIG,
        p_extra_stock_id: proposed.id,
      });
      check(Boolean(dupErr), "G duplicate sale prevented", rpcMessage(dupErr));

      const { error: undoSoldErr } = await admin.rpc("unconfirm_extra_stock", {
        p_extra_stock_id: proposed.id,
        p_actor_staff_id: actor.id,
      });
      check(Boolean(undoSoldErr), "sold Extra cannot be undone", rpcMessage(undoSoldErr));
    } else {
      check(true, "E/F/G Extra order (SKIP — no remaining pickup slot)");
    }

    const { data: catalogueAfter } = await admin.rpc(
      "storefront_collection_for_pickup_date",
      { p_pickup_date: tomorrowProbeDate },
    );
    check(
      JSON.stringify(catalogueBefore) === JSON.stringify(catalogueAfter),
      "I monthly catalogue selection unchanged",
    );

    const { data: productAfter } = await admin
      .from("orders")
      .select("id, status, ready_at, picked_up_at, production_started_at")
      .eq("id", PRODUCT_ORDER_ID)
      .maybeSingle();
    check(
      JSON.stringify(productBefore) === JSON.stringify(productAfter),
      "Product order unchanged",
    );

    const failed = checks.filter((c) => !c.ok);
    if (failed.length > 0) {
      throw new Error(`${failed.length} check(s) failed`);
    }
    console.log(`\nFresh Picks live: ${checks.length}/${checks.length} PASS`);
  } catch (err) {
    if (err instanceof MigrationBlockedError) {
      migrationBlocked = true;
      console.log(`BLOCKED — ${err.message}`);
      process.exitCode = 2;
      return;
    }
    console.error(err);
    process.exitCode = 1;
  } finally {
    await cleanupExtras();
    const { data: still } = await admin
      .from("extra_stock")
      .select("id")
      .or(`note.eq.${SIG},cake_name.ilike.%${SIG}%`);
    const { data: leftoverOrders } = await admin
      .from("orders")
      .select("id")
      .ilike("guest_name", `%${SIG}%`);
    if ((still ?? []).length > 0 || (leftoverOrders ?? []).length > 0) {
      console.error(
        `AUDIT leftover fixtures for SIG=${SIG}: extras=${(still ?? [])
          .map((r) => r.id)
          .join(",")} orders=${(leftoverOrders ?? []).map((r) => r.id).join(",")}`,
      );
      process.exitCode = 1;
    } else if (!migrationBlocked) {
      console.log(`Cleanup OK — zero Extra leftovers for SIG=${SIG}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
