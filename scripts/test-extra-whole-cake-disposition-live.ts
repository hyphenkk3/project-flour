/**
 * Live Fresh Pick disposition: two identical extras, assign, move, slices.
 * Run: npx tsx scripts/test-extra-whole-cake-disposition-live.ts
 *
 * Disposable Extra + guest-order fixtures only. Cleanup always.
 * Does not mutate Product order 7e9779ac-… or live Avocado inventory names
 * except via SIG-tagged Extra notes.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { isExtraAvailable } from "@/engines/extra/availability";
import { mapExtraStockRowToCalendarMarker } from "@/engines/extra/calendar-visibility";
import { isPublishedFreshPick } from "@/engines/extra/customer-fresh-picks";
import {
  defaultExtraOrderCutoffSlot,
  defaultExtraPickupFromSlot,
  extraOperatingSlotsForDate,
  extraPickupThroughIso,
} from "@/engines/extra/fresh-picks-eligibility";
import { extraCustomerPickupSlotsForDate } from "@/engines/extra/extra-pickup";
import { addBusinessCalendarDays, toBusinessDateKey } from "@/lib/dates";

const PRODUCT_ORDER_ID = "7e9779ac-152b-42e0-8002-34ba8e9b11b5";
const MIGRATION_HINT =
  "BLOCKED: apply supabase/migrations/20260909120000_extra_whole_cake_disposition.sql, then re-run.";

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

const SIG = `E2E-XDISP-${Date.now()}`;
console.log(`fixture signature SIG=${SIG}`);

function rpcMessage(error: { message?: string } | null | undefined): string {
  return error?.message ?? "";
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

  const extraIds: string[] = [];
  const orderIds: string[] = [];
  let failed = 0;

  function check(ok: boolean, label: string, detail?: string) {
    if (!ok) failed += 1;
    console.log(
      `${ok ? "PASS" : "FAIL"} — ${label}${detail ? `: ${detail}` : ""}`,
    );
  }

  async function cleanup() {
    if (orderIds.length > 0) {
      await admin.from("order_paid_addon_messages").delete().in(
        "order_paid_addon_id",
        (
          await admin
            .from("order_paid_addons")
            .select("id")
            .in("order_id", orderIds)
        ).data?.map((row) => row.id as string) ?? [],
      );
      await admin.from("order_paid_addons").delete().in("order_id", orderIds);
      await admin.from("order_complimentary_items").delete().in("order_id", orderIds);
      await admin.from("order_timeline_events").delete().in("order_id", orderIds);
      await admin.from("order_items").delete().in("order_id", orderIds);
      await admin.from("order_confirmation_snapshots").delete().in("order_id", orderIds);
      await admin.from("orders").delete().in("id", orderIds).is("customer_id", null);
    }
    const leftover = await admin
      .from("extra_stock")
      .select("id")
      .eq("note", SIG);
    const ids = [
      ...new Set([
        ...extraIds,
        ...((leftover.data ?? []).map((row) => row.id as string)),
      ]),
    ];
    if (ids.length > 0) {
      const { data: linked } = await admin
        .from("orders")
        .select("id")
        .in("extra_stock_id", ids);
      const linkedIds = (linked ?? []).map((row) => row.id as string);
      if (linkedIds.length > 0) {
        await admin.from("order_items").delete().in("order_id", linkedIds);
        await admin.from("order_timeline_events").delete().in("order_id", linkedIds);
        await admin.from("orders").delete().in("id", linkedIds).is("customer_id", null);
      }
      await admin.from("extra_stock_events").delete().in("extra_stock_id", ids);
      await admin.from("extra_stock").delete().in("id", ids);
    }
  }

  try {
    const probe = await admin.rpc("assign_extra_stock_to_order", {
      p_extra_stock_id: "00000000-0000-0000-0000-000000000000",
      p_order_id: "00000000-0000-0000-0000-000000000000",
      p_actor_staff_id: "00000000-0000-0000-0000-000000000000",
    });
    if (probe.error?.message?.includes("Could not find the function")) {
      throw new MigrationBlockedError(MIGRATION_HINT);
    }

    const { data: roles } = await admin.from("roles").select("id, code");
    const roleByCode = new Map((roles ?? []).map((r) => [r.code, r.id]));
    async function staffFor(code: string) {
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
    const actor =
      (await staffFor("bakery")) ??
      (await staffFor("manager")) ??
      (await staffFor("owner"));
    if (!actor?.id) throw new Error("No bakery-capable staff_profiles row");
    const collectionStaff = await staffFor("collection");

    const { data: cake } = await admin
      .from("library_cakes")
      .select("id, name, library_cake_sizes ( id, label, price )")
      .in("status", ["active", "seasonal"])
      .limit(1)
      .maybeSingle();
    type SizeEmbed = { id: string; label: string; price: number };
    const size = ((cake?.library_cake_sizes ?? []) as SizeEmbed[])[0];
    if (!cake?.id || !size?.id) throw new Error("Need an active Library cake/size");

    const { data: productBefore } = await admin
      .from("orders")
      .select("id, status")
      .eq("id", PRODUCT_ORDER_ID)
      .maybeSingle();

    const todayYmd = toBusinessDateKey();
    const tomorrowYmd = addBusinessCalendarDays(todayYmd, 1);
    const now = new Date();
    const todayFrom =
      defaultExtraPickupFromSlot({ pickupFromDate: todayYmd, todayYmd, now }) ??
      extraOperatingSlotsForDate(todayYmd)[0]?.value;
    const todayCutoff = defaultExtraOrderCutoffSlot({
      cutoffDate: todayYmd,
      todayYmd,
      now,
    });
    const fromDate = todayFrom && todayCutoff ? todayYmd : tomorrowYmd;
    if (!fromDate) throw new Error("no Fresh Pick date");
    const fromSlot =
      (fromDate === todayYmd
        ? todayFrom
        : extraOperatingSlotsForDate(fromDate)[0]?.value) ?? "12:00";
    const cutoffSlot =
      (fromDate === todayYmd
        ? todayCutoff
        : extraOperatingSlotsForDate(fromDate).at(-1)?.value) ?? "17:30";
    const fromIso = extraPickupThroughIso(fromDate, fromSlot);
    const throughIso = extraPickupThroughIso(fromDate, cutoffSlot);
    if (!fromIso || !throughIso) throw new Error("window iso missing");

    async function confirmTwin(label: string) {
      const { data, error } = await admin.rpc("propose_extra_stock", {
        p_actor_staff_id: actor.id,
        p_cake_name: cake.name,
        p_size_label: size.label,
        p_prepared_on: fromDate,
        p_note: SIG,
        p_library_cake_id: cake.id,
        p_library_cake_size_id: size.id,
      });
      if (error) throw new Error(`${label} propose: ${error.message}`);
      const id = data?.id as string;
      extraIds.push(id);
      const { error: cErr } = await admin.rpc("confirm_extra_stock", {
        p_extra_stock_id: id,
        p_actor_staff_id: actor.id,
        p_prepared_on: fromDate,
        p_pickup_available_from_at: fromIso,
        p_pickup_through_at: throughIso,
      });
      if (cErr) throw new Error(`${label} confirm: ${cErr.message}`);
      return id;
    }

    const extraA = await confirmTwin("A");
    const extraB = await confirmTwin("B");
    check(extraA !== extraB, "two identical extras have distinct ids");

    const pickupSlots = extraCustomerPickupSlotsForDate(
      fromDate,
      { pickupAvailableFromAt: fromIso, orderCutoffAt: throughIso },
      now,
    );
    const pickupTime = pickupSlots.at(-1)?.value ?? fromSlot;

    const { data: soldOrder, error: sellErr } = await admin.rpc(
      "submit_guest_extra_order",
      {
        p_customer_name: `${SIG} Guest A`,
        p_phone: "0190000199",
        p_email: null,
        p_pickup_date: fromDate,
        p_pickup_time: pickupTime,
        p_notes: SIG,
        p_extra_stock_id: extraA,
      },
    );
    check(!sellErr, "customer sale of Extra A", rpcMessage(sellErr));
    if (soldOrder?.id) orderIds.push(soldOrder.id as string);

    const { data: aRow } = await admin
      .from("extra_stock")
      .select("id, sold_at, lifecycle, cake_name, size_label, prepared_on, pickup_available_from_at, pickup_through_at, library_cake_id, library_cake_size_id, cut_into_slices_at")
      .eq("id", extraA)
      .maybeSingle();
    const { data: bRow } = await admin
      .from("extra_stock")
      .select("id, sold_at, lifecycle, cake_name, size_label, prepared_on, pickup_available_from_at, pickup_through_at, library_cake_id, library_cake_size_id, cut_into_slices_at")
      .eq("id", extraB)
      .maybeSingle();
    check(Boolean(aRow?.sold_at), "Extra A sold_at stamped");
    check(aRow?.lifecycle === "confirmed", "Extra A stays confirmed");
    check(!bRow?.sold_at, "Extra B remains unsold");
    check(
      mapExtraStockRowToCalendarMarker(aRow as never) == null,
      "sold Extra A is not an active calendar marker",
    );
    check(
      mapExtraStockRowToCalendarMarker(bRow as never) != null,
      "unsold Extra B remains an active calendar marker",
    );
    check(
      isPublishedFreshPick({
        lifecycle: "confirmed",
        pickupThroughAt: bRow?.pickup_through_at ?? null,
        soldAt: bRow?.sold_at ?? null,
        cutIntoSlicesAt: bRow?.cut_into_slices_at ?? null,
        now,
      }),
      "customer Fresh Picks still shows Extra B",
    );

    const { data: listedAfterSale } = await admin
      .from("extra_stock")
      .select("id")
      .eq("lifecycle", "confirmed")
      .is("sold_at", null)
      .is("cut_into_slices_at", null)
      .in("id", [extraA, extraB]);
    const listedAfterSaleIds = new Set(
      (listedAfterSale ?? []).map((row) => row.id as string),
    );
    check(
      !listedAfterSaleIds.has(extraA),
      "sold Extra A is hidden from customer Fresh Pick availability",
    );
    check(
      listedAfterSaleIds.has(extraB),
      "identical Extra B remains in customer Fresh Pick availability",
    );

    const { data: boardA } = await admin
      .from("orders")
      .select("id, extra_stock_id")
      .eq("extra_stock_id", extraA)
      .maybeSingle();
    check(
      boardA?.id === soldOrder?.id && boardA?.extra_stock_id === extraA,
      "Extra Board can resolve sold Extra A to its order",
    );

    const { error: resellA } = await admin.rpc("submit_guest_extra_order", {
      p_customer_name: `${SIG} Guest A retry`,
      p_phone: "0190000197",
      p_email: null,
      p_pickup_date: fromDate,
      p_pickup_time: pickupTime,
      p_notes: SIG,
      p_extra_stock_id: extraA,
    });
    check(Boolean(resellA), "sold Extra A cannot be purchased again", rpcMessage(resellA));

    const extraC = await confirmTwin("C");
    const { data: orderNumber, error: numErr } = await admin.rpc(
      "allocate_order_number",
    );
    check(!numErr, "allocate order number for assign", rpcMessage(numErr));
    const { data: assignOrder, error: insErr } = await admin
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_id: null,
        guest_name: `${SIG} Assign Target`,
        guest_phone: "0190000198",
        fulfilment_method: "pickup",
        pickup_date: fromDate,
        pickup_time: pickupTime,
        status: "submitted",
        payment_status: "unpaid",
        customer_notes: SIG,
        extra_stock_id: null,
        order_source: "customer_website",
        include_receipt: false,
      })
      .select("id, extra_stock_id")
      .maybeSingle();
    check(!insErr && Boolean(assignOrder?.id), "insert assign-target order", rpcMessage(insErr));
    if (assignOrder?.id) {
      orderIds.push(assignOrder.id);
      await admin.from("order_items").insert({
        order_id: assignOrder.id,
        cake_id: cake.id,
        cake_size_id: size.id,
        quantity: 1,
        unit_price: size.price ?? 0,
        cake_name: cake.name,
        size_label: size.label,
      });
    }

    if (collectionStaff?.id) {
      const { error } = await admin.rpc("assign_extra_stock_to_order", {
        p_extra_stock_id: extraC,
        p_order_id: assignOrder?.id,
        p_actor_staff_id: collectionStaff.id,
      });
      check(Boolean(error), "collection role cannot assign Extra", rpcMessage(error));
    } else {
      check(true, "collection role cannot assign Extra (SKIP — no collection staff)");
    }

    const { error: assignErr } = await admin.rpc("assign_extra_stock_to_order", {
      p_extra_stock_id: extraC,
      p_order_id: assignOrder?.id,
      p_actor_staff_id: actor.id,
    });
    check(!assignErr, "assign Extra C to existing order", rpcMessage(assignErr));

    const { data: cAfter } = await admin
      .from("extra_stock")
      .select("sold_at, cut_into_slices_at")
      .eq("id", extraC)
      .maybeSingle();
    const { data: linked } = await admin
      .from("orders")
      .select("extra_stock_id")
      .eq("id", assignOrder?.id ?? "")
      .maybeSingle();
    check(Boolean(cAfter?.sold_at), "assigned Extra C is sold");
    check(linked?.extra_stock_id === extraC, "order extra_stock_id is Extra C");
    const { count: itemCount } = await admin
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", assignOrder?.id ?? "");
    check(itemCount === 1, "assign did not insert a duplicate order item");
    const { data: boardC } = await admin
      .from("orders")
      .select("id, order_number, extra_stock_id")
      .eq("extra_stock_id", extraC)
      .maybeSingle();
    check(
      boardC?.id === assignOrder?.id && boardC?.extra_stock_id === extraC,
      "Extra Board can resolve assigned Extra C to its order",
    );
    check(
      mapExtraStockRowToCalendarMarker({
        ...(cAfter as object),
        id: extraC,
        cake_name: cake.name,
        size_label: size.label,
        lifecycle: "confirmed",
        prepared_on: fromDate,
        pickup_available_from_at: fromIso,
        pickup_through_at: throughIso,
        library_cake_id: cake.id,
        library_cake_size_id: size.id,
        sold_at: cAfter?.sold_at ?? null,
        cut_into_slices_at: cAfter?.cut_into_slices_at ?? null,
      } as never) == null,
      "assigned Extra C is not an active calendar marker",
    );

    const extraD = await confirmTwin("D");
    const destDate =
      fromDate === todayYmd && tomorrowYmd ? tomorrowYmd : fromDate;
    const destSlots = extraOperatingSlotsForDate(destDate);
    const destFrom = destSlots[0]?.value ?? "12:00";
    let destCut = destSlots.at(-1)?.value ?? "17:30";
    if (destDate === fromDate && destSlots.length >= 3) {
      destCut = destSlots[1]?.value ?? destCut;
    }
    const destFromIso = extraPickupThroughIso(destDate, destFrom);
    const destThroughIso = extraPickupThroughIso(destDate, destCut);
    if (!destFromIso || !destThroughIso) {
      throw new Error("move destination window iso missing");
    }
    const { error: moveErr } = await admin.rpc(
      "move_extra_stock_fresh_pick_window",
      {
        p_extra_stock_id: extraD,
        p_actor_staff_id: actor.id,
        p_prepared_on: destDate,
        p_pickup_available_from_at: destFromIso,
        p_pickup_through_at: destThroughIso,
      },
    );
    check(!moveErr, "move Extra D to another valid Fresh Pick window", rpcMessage(moveErr));
    const { data: moved } = await admin
      .from("extra_stock")
      .select(
        "id, prepared_on, pickup_available_from_at, pickup_through_at, sold_at, cut_into_slices_at, lifecycle, cake_name, size_label, library_cake_id, library_cake_size_id",
      )
      .eq("id", extraD)
      .maybeSingle();
    check(moved?.id === extraD, "moved Extra keeps the same extra_stock.id");
    check(moved?.prepared_on === destDate, "moved Extra prepared_on follows the new window");
    check(
      new Date(moved?.pickup_available_from_at ?? "").getTime() ===
        new Date(destFromIso).getTime(),
      "moved Extra pickup_available_from_at follows the new window",
    );
    check(
      new Date(moved?.pickup_through_at ?? "").getTime() ===
        new Date(destThroughIso).getTime(),
      "moved Extra pickup_through_at follows the new window",
    );
    check(
      mapExtraStockRowToCalendarMarker(moved as never) != null,
      "moved Extra remains an active calendar marker",
    );
    check(
      isPublishedFreshPick({
        lifecycle: "confirmed",
        pickupThroughAt: moved?.pickup_through_at ?? null,
        soldAt: moved?.sold_at ?? null,
        cutIntoSlicesAt: moved?.cut_into_slices_at ?? null,
        now,
      }),
      "customer Fresh Picks follow Extra D's new window",
    );

    const future = addBusinessCalendarDays(todayYmd, 2);
    if (future) {
      const { error: badMove } = await admin.rpc(
        "move_extra_stock_fresh_pick_window",
        {
          p_extra_stock_id: extraB,
          p_actor_staff_id: actor.id,
          p_prepared_on: future,
          p_pickup_available_from_at: extraPickupThroughIso(future, "12:00"),
          p_pickup_through_at: extraPickupThroughIso(future, "14:00"),
        },
      );
      check(Boolean(badMove), "invalid move date rejected", rpcMessage(badMove));
    }

    const extraE = await confirmTwin("E");
    const unconfirmActor = (await staffFor("manager")) ?? actor;
    const { error: unconfirmE } = await admin.rpc("unconfirm_extra_stock", {
      p_extra_stock_id: extraE,
      p_actor_staff_id: unconfirmActor.id,
    });
    check(!unconfirmE, "ordinary confirmed Extra can be unconfirmed", rpcMessage(unconfirmE));
    const { data: eAfter } = await admin
      .from("extra_stock")
      .select("lifecycle, sold_at, cut_into_slices_at")
      .eq("id", extraE)
      .maybeSingle();
    check(eAfter?.lifecycle === "proposed", "unconfirmed Extra returns to proposed");

    const { error: undoSold } = await admin.rpc("unconfirm_extra_stock", {
      p_extra_stock_id: extraA,
      p_actor_staff_id: actor.id,
    });
    check(Boolean(undoSold), "sold Extra cannot be unconfirmed", rpcMessage(undoSold));

    const opsStaff = await staffFor("customer_operations");
    if (opsStaff?.id) {
      const { error } = await admin.rpc("assign_extra_stock_to_order", {
        p_extra_stock_id: extraD,
        p_order_id: assignOrder?.id,
        p_actor_staff_id: opsStaff.id,
      });
      check(
        Boolean(error) && /not authorized/i.test(error?.message ?? ""),
        "customer operations cannot assign Extra",
        rpcMessage(error),
      );
    } else {
      check(
        true,
        "customer operations cannot assign Extra (SKIP — no customer_operations staff)",
      );
    }

    if (collectionStaff?.id) {
      const { error: cutDenied } = await admin.rpc("cut_extra_stock_into_slices", {
        p_extra_stock_id: extraD,
        p_actor_staff_id: collectionStaff.id,
      });
      check(
        Boolean(cutDenied) && /not authorized/i.test(cutDenied?.message ?? ""),
        "collection cannot cut Extra",
        rpcMessage(cutDenied),
      );
      const { error: unconfirmDenied } = await admin.rpc("unconfirm_extra_stock", {
        p_extra_stock_id: extraD,
        p_actor_staff_id: collectionStaff.id,
      });
      check(
        Boolean(unconfirmDenied) && /not authorized/i.test(unconfirmDenied?.message ?? ""),
        "collection cannot unconfirm Extra",
        rpcMessage(unconfirmDenied),
      );
    } else {
      check(true, "collection cannot cut Extra (SKIP — no collection staff)");
      check(true, "collection cannot unconfirm Extra (SKIP — no collection staff)");
    }

    const { error: sliceErr } = await admin.rpc("cut_extra_stock_into_slices", {
      p_extra_stock_id: extraB,
      p_actor_staff_id: actor.id,
    });
    check(!sliceErr, "cut Extra B into slices", rpcMessage(sliceErr));
    const { data: sliced } = await admin
      .from("extra_stock")
      .select("cut_into_slices_at, sold_at, lifecycle")
      .eq("id", extraB)
      .maybeSingle();
    check(Boolean(sliced?.cut_into_slices_at), "Extra B cut_into_slices_at stamped");
    check(!sliced?.sold_at, "sliced Extra is not sold");
    check(
      mapExtraStockRowToCalendarMarker({
        id: extraB,
        cake_name: cake.name,
        size_label: size.label,
        lifecycle: "confirmed",
        prepared_on: fromDate,
        pickup_available_from_at: fromIso,
        pickup_through_at: throughIso,
        library_cake_id: cake.id,
        library_cake_size_id: size.id,
        sold_at: sliced?.sold_at ?? null,
        cut_into_slices_at: sliced?.cut_into_slices_at ?? null,
      } as never) == null,
      "sliced Extra B is not an active calendar marker",
    );
    check(
      !isPublishedFreshPick({
        lifecycle: "confirmed",
        pickupThroughAt: throughIso,
        soldAt: sliced?.sold_at ?? null,
        cutIntoSlicesAt: sliced?.cut_into_slices_at ?? null,
        now,
      }),
      "sliced Extra is hidden from customer Fresh Picks",
    );
    check(
      !isExtraAvailable({
        lifecycle: "confirmed",
        pickupThroughAt: throughIso,
        soldAt: sliced?.sold_at ?? null,
        cutIntoSlicesAt: sliced?.cut_into_slices_at ?? null,
        now,
      }),
      "sliced Extra is not available",
    );

    const { error: undoSliced } = await admin.rpc("unconfirm_extra_stock", {
      p_extra_stock_id: extraB,
      p_actor_staff_id: actor.id,
    });
    check(Boolean(undoSliced), "sliced Extra cannot be unconfirmed", rpcMessage(undoSliced));

    const { data: dAfterSlice } = await admin
      .from("extra_stock")
      .select("sold_at, cut_into_slices_at, lifecycle")
      .eq("id", extraD)
      .maybeSingle();
    check(!dAfterSlice?.cut_into_slices_at, "identical Extra D is unaffected by slicing Extra B");
    check(!dAfterSlice?.sold_at, "identical Extra D remains unsold after slicing Extra B");
    check(dAfterSlice?.lifecycle === "confirmed", "identical Extra D stays confirmed");

    const { data: listedAfterSlice } = await admin
      .from("extra_stock")
      .select("id")
      .eq("lifecycle", "confirmed")
      .is("sold_at", null)
      .is("cut_into_slices_at", null)
      .in("id", [extraB, extraD]);
    const listedAfterSliceIds = new Set(
      (listedAfterSlice ?? []).map((row) => row.id as string),
    );
    check(
      !listedAfterSliceIds.has(extraB),
      "sliced Extra B is hidden from customer Fresh Pick availability",
    );
    check(
      listedAfterSliceIds.has(extraD),
      "identical Extra D remains purchasable after Extra B is sliced",
    );

    const { data: events } = await admin
      .from("extra_stock_events")
      .select("event_type, extra_stock_id")
      .in("extra_stock_id", [extraA, extraB, extraC, extraD, extraE]);
    const types = new Set((events ?? []).map((row) => row.event_type as string));
    check(types.has("created"), "history records created");
    check(types.has("confirmed"), "history records confirmed");
    check(types.has("sold"), "history records sold");
    check(types.has("assigned"), "history records assigned");
    check(types.has("moved"), "history records moved");
    check(types.has("cut_into_slices"), "history records cut into slices");
    check(types.has("unconfirmed"), "history records unconfirmed");

    const { data: productAfter } = await admin
      .from("orders")
      .select("id, status")
      .eq("id", PRODUCT_ORDER_ID)
      .maybeSingle();
    check(
      productAfter?.status === productBefore?.status,
      "product order untouched",
    );
  } catch (error) {
    if (error instanceof MigrationBlockedError) {
      console.log(`SKIP live DB (${error.message})`);
      return;
    }
    failed += 1;
    console.error(error instanceof Error ? error.message : error);
  } finally {
    await cleanup();
  }

  if (failed > 0) {
    process.exitCode = 1;
    console.log(`FAIL extra whole-cake disposition live (${failed})`);
    return;
  }
  console.log("PASS extra whole-cake disposition live");
}

void main();
