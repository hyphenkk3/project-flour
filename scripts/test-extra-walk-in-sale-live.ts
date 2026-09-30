/**
 * Live DEV: Available → Walk-in Hold → Sold.
 * Run: npx tsx scripts/test-extra-walk-in-sale-live.ts
 *
 * Disposable Extra + guest-order fixtures only. Cleanup always.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { isExtraAvailable } from "@/engines/extra/availability";
import {
  isCustomerOrderableFreshPick,
  isPublishedFreshPick,
} from "@/engines/extra/customer-fresh-picks";
import {
  defaultExtraOrderCutoffSlot,
  defaultExtraPickupFromSlot,
  extraOperatingSlotsForDate,
} from "@/engines/extra/fresh-picks-eligibility";
import { extraPickupThroughIso } from "@/engines/extra/fresh-picks-time";
import { extraWalkInSalePickupDate } from "@/engines/extra/walk-in-sale";
import { addBusinessCalendarDays, toBusinessDateKey } from "@/lib/dates";

const MIGRATION_HINT =
  "BLOCKED: apply supabase/migrations/20260929160000_complete_extra_stock_walk_in_sale.sql, then re-run.";

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

const SIG = `E2E-WSALE-${Date.now()}`;
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
  if (!url.includes("tzwtpxdcggesgjaqxkqr")) {
    throw new Error("Refusing to run outside project-flour-dev.");
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const extraIds: string[] = [];
  const orderIds: string[] = [];
  const voucherIds: string[] = [];
  let failed = 0;

  function check(ok: boolean, label: string, detail?: string) {
    if (!ok) failed += 1;
    console.log(
      `${ok ? "PASS" : "FAIL"} — ${label}${detail ? `: ${detail}` : ""}`,
    );
  }

  async function cleanupOrders(ids: string[]) {
    if (ids.length === 0) return;
    const { data: allocs } = await admin
      .from("payment_allocations")
      .select("id, payment_id")
      .in("order_id", ids);
    const paymentIds = [
      ...new Set(
        (allocs ?? [])
          .map((row) => row.payment_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    await admin.from("payment_allocations").delete().in("order_id", ids);
    if (paymentIds.length > 0) {
      await admin.from("payments").delete().in("id", paymentIds);
    }
    await admin.from("order_adjustments").delete().in("order_id", ids);
    await admin.from("order_timeline_events").delete().in("order_id", ids);
    await admin.from("order_items").delete().in("order_id", ids);
    await admin.from("orders").delete().in("id", ids).is("customer_id", null);
  }

  async function cleanup() {
    if (voucherIds.length > 0) {
      await admin
        .from("catalogue_voucher_redemptions")
        .delete()
        .in("voucher_id", voucherIds);
      await admin.from("library_voucher_rule_values").delete().in(
        "rule_id",
        (
          await admin
            .from("library_voucher_rules")
            .select("id")
            .in("voucher_id", voucherIds)
        ).data?.map((row) => row.id as string) ?? [],
      );
      await admin.from("library_voucher_rules").delete().in("voucher_id", voucherIds);
    }
    const leftover = await admin.from("extra_stock").select("id").eq("note", SIG);
    const ids = [
      ...new Set([
        ...extraIds,
        ...((leftover.data ?? []).map((row) => row.id as string)),
      ]),
    ];
    const linkedIds = new Set(orderIds);
    if (ids.length > 0) {
      const { data: linked } = await admin
        .from("orders")
        .select("id")
        .in("extra_stock_id", ids);
      for (const row of linked ?? []) linkedIds.add(row.id as string);
    }
    await cleanupOrders([...linkedIds]);
    if (ids.length > 0) {
      await admin.from("extra_stock_events").delete().in("extra_stock_id", ids);
      await admin.from("extra_stock").delete().in("id", ids);
    }
    if (voucherIds.length > 0) {
      await admin.from("library_vouchers").delete().in("id", voucherIds);
    }
  }

  try {
    const probe = await admin.rpc("complete_extra_stock_walk_in_sale", {
      p_extra_stock_id: "00000000-0000-0000-0000-000000000000",
      p_actor_staff_id: "00000000-0000-0000-0000-000000000000",
      p_payment_method: "wb_qr",
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

    const owner = await staffFor("owner");
    const manager = await staffFor("manager");
    const co = await staffFor("customer_operations");
    const holder = co ?? manager ?? owner;
    if (!holder?.id) throw new Error("No walk-in-hold-capable staff_profiles row");
    const confirmer = (await staffFor("bakery")) ?? manager ?? owner;
    if (!confirmer?.id) throw new Error("No Extra-confirm-capable staff_profiles row");

    const { data: cake } = await admin
      .from("library_cakes")
      .select("id, name, library_cake_sizes ( id, label, price )")
      .in("status", ["active", "seasonal"])
      .limit(1)
      .maybeSingle();
    type SizeEmbed = { id: string; label: string; price: number };
    const size = ((cake?.library_cake_sizes ?? []) as SizeEmbed[])[0];
    if (!cake?.id || !size?.id) throw new Error("Need an active Library cake/size");

    const todayYmd = toBusinessDateKey();
    const now = new Date();
    let preparedOn = todayYmd;
    let fromSlot =
      defaultExtraPickupFromSlot({ pickupFromDate: todayYmd, todayYmd, now }) ??
      extraOperatingSlotsForDate(todayYmd)[0]?.value;
    let cutoffSlot = defaultExtraOrderCutoffSlot({
      cutoffDate: todayYmd,
      todayYmd,
      now,
    });
    if (!fromSlot || !cutoffSlot) {
      const tomorrowYmd = addBusinessCalendarDays(todayYmd, 1);
      if (!tomorrowYmd) {
        throw new Error("Need operating Extra slots for today");
      }
      fromSlot =
        defaultExtraPickupFromSlot({
          pickupFromDate: tomorrowYmd,
          todayYmd,
          now,
        }) ?? extraOperatingSlotsForDate(tomorrowYmd)[0]?.value;
      cutoffSlot =
        defaultExtraOrderCutoffSlot({
          cutoffDate: tomorrowYmd,
          todayYmd,
          now,
        }) ?? extraOperatingSlotsForDate(tomorrowYmd).at(-1)?.value ?? null;
      preparedOn = tomorrowYmd;
    }
    if (!fromSlot || !cutoffSlot) {
      throw new Error("Need operating Extra slots for today");
    }
    const fromIso = extraPickupThroughIso(preparedOn, fromSlot);
    const throughIso = extraPickupThroughIso(preparedOn, cutoffSlot);
    if (!fromIso || !throughIso) throw new Error("Could not build Extra window");

    async function confirmUnit(label: string) {
      const { data, error } = await admin.rpc("propose_extra_stock", {
        p_actor_staff_id: confirmer.id,
        p_cake_name: cake.name,
        p_size_label: size.label,
        p_prepared_on: preparedOn,
        p_note: SIG,
        p_library_cake_id: cake.id,
        p_library_cake_size_id: size.id,
      });
      if (error) throw new Error(`${label} propose: ${error.message}`);
      const id = data?.id as string;
      extraIds.push(id);
      const { error: cErr } = await admin.rpc("confirm_extra_stock", {
        p_extra_stock_id: id,
        p_actor_staff_id: confirmer.id,
        p_prepared_on: preparedOn,
        p_pickup_available_from_at: fromIso,
        p_pickup_through_at: throughIso,
      });
      if (cErr) throw new Error(`${label} confirm: ${cErr.message}`);
      return id;
    }

    async function hold(id: string) {
      const { error } = await admin.rpc("hold_extra_stock_walk_in", {
        p_extra_stock_id: id,
        p_actor_staff_id: holder.id,
      });
      if (error) throw new Error(`hold: ${error.message}`);
    }

    const salePickup = extraWalkInSalePickupDate({
      preparedOn,
      pickupAvailableFromAt: fromIso,
      pickupThroughAt: throughIso,
      now,
    });

    const extraA = await confirmUnit("A");
    const { error: soldOpen } = await admin.rpc(
      "complete_extra_stock_walk_in_sale",
      {
        p_extra_stock_id: extraA,
        p_actor_staff_id: holder.id,
        p_payment_method: "wb_qr",
      },
    );
    check(
      Boolean(soldOpen?.message?.includes("Walk-in Hold")),
      "TEST: Available cannot Sold directly",
      rpcMessage(soldOpen),
    );

    await hold(extraA);
    const { data: heldA } = await admin
      .from("extra_stock")
      .select("sold_at, walk_in_held_until")
      .eq("id", extraA)
      .single();
    check(
      Boolean(heldA?.walk_in_held_until) && !heldA?.sold_at,
      "TEST A: Walk-in Hold reserves the cake",
    );
    check(
      !isExtraAvailable({
        lifecycle: "confirmed",
        pickupThroughAt: throughIso,
        walkInHeldUntil: heldA?.walk_in_held_until ?? null,
        now: new Date(),
      }),
      "TEST A: held cake is not available to another order",
    );
    check(
      isPublishedFreshPick({
        lifecycle: "confirmed",
        pickupThroughAt: throughIso,
        walkInHeldUntil: heldA?.walk_in_held_until ?? null,
        now: new Date(),
      }) &&
        !isCustomerOrderableFreshPick({
          lifecycle: "confirmed",
          pickupThroughAt: throughIso,
          walkInHeldUntil: heldA?.walk_in_held_until ?? null,
          now: new Date(),
        }),
      "TEST G: storefront cannot purchase a held cake",
    );

    const { error: guestHeld } = await admin.rpc("submit_guest_extra_order", {
      p_customer_name: `${SIG} Held`,
      p_phone: "0190000301",
      p_email: null,
      p_pickup_date: preparedOn,
      p_pickup_time: fromSlot,
      p_notes: SIG,
      p_extra_stock_id: extraA,
    });
    check(
      Boolean(guestHeld?.message?.toLowerCase().includes("walk-in hold")),
      "TEST G: guest Extra submit rejected while held",
      rpcMessage(guestHeld),
    );

    const { error: dupHold } = await admin.rpc("hold_extra_stock_walk_in", {
      p_extra_stock_id: extraA,
      p_actor_staff_id: holder.id,
    });
    check(Boolean(dupHold), "TEST H: second hold fails", rpcMessage(dupHold));

    const extraF = await confirmUnit("F");
    await hold(extraF);
    const { error: released } = await admin.rpc(
      "release_extra_stock_walk_in_hold",
      {
        p_extra_stock_id: extraF,
        p_actor_staff_id: holder.id,
      },
    );
    const { data: afterRelease } = await admin
      .from("extra_stock")
      .select("walk_in_held_until, sold_at")
      .eq("id", extraF)
      .single();
    check(!released, "TEST F: Release succeeds", rpcMessage(released));
    check(
      !afterRelease?.walk_in_held_until && !afterRelease?.sold_at,
      "TEST F: hold removed and cake available again",
    );

    const { data: saleB, error: saleBErr } = await admin.rpc(
      "complete_extra_stock_walk_in_sale",
      {
        p_extra_stock_id: extraA,
        p_actor_staff_id: holder.id,
        p_payment_method: "wb_qr",
      },
    );
    check(!saleBErr, "TEST B: Hold → Sold without voucher", rpcMessage(saleBErr));
    const saleBRow = saleB as {
      order_id?: string;
      order_status?: string;
    } | null;
    if (saleBRow?.order_id) orderIds.push(saleBRow.order_id);
    const { data: orderB } = saleBRow?.order_id
      ? await admin
          .from("orders")
          .select(
            "guest_name, order_source, extra_stock_id, pickup_date, status, payment_status",
          )
          .eq("id", saleBRow.order_id)
          .single()
      : { data: null };
    check(
      orderB?.guest_name === "WALK-IN" &&
        orderB?.order_source === "walk_in" &&
        orderB?.extra_stock_id === extraA &&
        orderB?.pickup_date === salePickup &&
        orderB?.status === "paid" &&
        orderB?.payment_status === "paid",
      "TEST B: resulting order is paid WALK-IN on the Extra collection date",
    );
    const { data: extraSold } = await admin
      .from("extra_stock")
      .select("sold_at, walk_in_held_until")
      .eq("id", extraA)
      .single();
    check(
      Boolean(extraSold?.sold_at) && !extraSold?.walk_in_held_until,
      "TEST B: cake is sold and no longer held",
    );

    const { error: saleAgain } = await admin.rpc(
      "complete_extra_stock_walk_in_sale",
      {
        p_extra_stock_id: extraA,
        p_actor_staff_id: holder.id,
        p_payment_method: "wb_qr",
      },
    );
    check(
      Boolean(saleAgain),
      "TEST I: second Sold on the same cake fails",
      rpcMessage(saleAgain),
    );

    const extraC = await confirmUnit("C");
    await hold(extraC);
    const { data: rm10, error: rm10Err } = await admin
      .from("library_vouchers")
      .insert({
        code: `WSALE10-${Date.now().toString().slice(-6)}`,
        voucher_type: "fixed_amount",
        value: 10,
        valid_from: todayYmd,
        valid_until: preparedOn >= todayYmd ? preparedOn : todayYmd,
        status: "active",
      })
      .select("id")
      .single();
    if (rm10Err || !rm10) throw new Error(rm10Err?.message ?? "RM10 voucher");
    voucherIds.push(rm10.id);
    const { data: saleC, error: saleCErr } = await admin.rpc(
      "complete_extra_stock_walk_in_sale",
      {
        p_extra_stock_id: extraC,
        p_actor_staff_id: holder.id,
        p_payment_method: "wb_qr",
        p_catalogue_voucher_id: rm10.id,
      },
    );
    check(!saleCErr, "TEST C: Sold with RM10 voucher", rpcMessage(saleCErr));
    const saleCRow = saleC as {
      order_id?: string;
      amount_due?: number;
    } | null;
    if (saleCRow?.order_id) orderIds.push(saleCRow.order_id);
    const { data: adjC } = saleCRow?.order_id
      ? await admin
          .from("order_adjustments")
          .select("code, amount")
          .eq("order_id", saleCRow.order_id)
      : { data: null };
    check(
      (adjC ?? []).some(
        (row) =>
          row.code === "catalogue_voucher" && Number(row.amount) === -10,
      ),
      "TEST C: catalogue voucher recorded at -RM10",
    );

    const extraD = await confirmUnit("D");
    await hold(extraD);
    const { data: fpOnly, error: fpErr } = await admin
      .from("library_vouchers")
      .insert({
        code: `WSALEFP-${Date.now().toString().slice(-6)}`,
        voucher_type: "fixed_amount",
        value: 10,
        valid_from: todayYmd,
        valid_until: preparedOn >= todayYmd ? preparedOn : todayYmd,
        status: "active",
      })
      .select("id")
      .single();
    if (fpErr || !fpOnly) throw new Error(fpErr?.message ?? "FP voucher");
    voucherIds.push(fpOnly.id);
    const { data: fpRule, error: fpRuleErr } = await admin
      .from("library_voucher_rules")
      .insert({ voucher_id: fpOnly.id, rule_type: "order_type" })
      .select("id")
      .single();
    if (fpRuleErr || !fpRule) throw new Error(fpRuleErr?.message ?? "FP rule");
    const { error: fpValErr } = await admin
      .from("library_voucher_rule_values")
      .insert({ rule_id: fpRule.id, value_code: "fresh_pick" });
    if (fpValErr) throw new Error(fpValErr.message);
    const { data: saleD, error: saleDErr } = await admin.rpc(
      "complete_extra_stock_walk_in_sale",
      {
        p_extra_stock_id: extraD,
        p_actor_staff_id: holder.id,
        p_payment_method: "wb_qr",
        p_catalogue_voucher_id: fpOnly.id,
      },
    );
    check(
      !saleDErr,
      "TEST D: Fresh Pick-only voucher applies on Extra sale",
      rpcMessage(saleDErr),
    );
    if ((saleD as { order_id?: string } | null)?.order_id) {
      orderIds.push((saleD as { order_id: string }).order_id);
    }

    const extraE = await confirmUnit("E");
    await hold(extraE);
    const { data: preOnly, error: preErr } = await admin
      .from("library_vouchers")
      .insert({
        code: `WSALEPRE-${Date.now().toString().slice(-6)}`,
        voucher_type: "fixed_amount",
        value: 10,
        valid_from: todayYmd,
        valid_until: preparedOn >= todayYmd ? preparedOn : todayYmd,
        status: "active",
      })
      .select("id")
      .single();
    if (preErr || !preOnly) throw new Error(preErr?.message ?? "preorder voucher");
    voucherIds.push(preOnly.id);
    const { data: preRule, error: preRuleErr } = await admin
      .from("library_voucher_rules")
      .insert({ voucher_id: preOnly.id, rule_type: "order_type" })
      .select("id")
      .single();
    if (preRuleErr || !preRule) throw new Error(preRuleErr?.message ?? "pre rule");
    const { error: preValErr } = await admin
      .from("library_voucher_rule_values")
      .insert({ rule_id: preRule.id, value_code: "preorder" });
    if (preValErr) throw new Error(preValErr.message);
    const { error: saleEErr } = await admin.rpc(
      "complete_extra_stock_walk_in_sale",
      {
        p_extra_stock_id: extraE,
        p_actor_staff_id: holder.id,
        p_payment_method: "wb_qr",
        p_catalogue_voucher_id: preOnly.id,
      },
    );
    const { data: extraEAfter } = await admin
      .from("extra_stock")
      .select("sold_at, walk_in_held_until")
      .eq("id", extraE)
      .single();
    check(
      Boolean(saleEErr),
      "TEST E: Pre-order-only voucher is not applicable",
      rpcMessage(saleEErr),
    );
    check(
      !extraEAfter?.sold_at && Boolean(extraEAfter?.walk_in_held_until),
      "TEST E / J: failed Sold leaves the Walk-in Hold in place",
    );

    const extraI = await confirmUnit("I");
    await hold(extraI);
    const [firstSale, secondSale] = await Promise.all([
      admin.rpc("complete_extra_stock_walk_in_sale", {
        p_extra_stock_id: extraI,
        p_actor_staff_id: holder.id,
        p_payment_method: "wb_qr",
      }),
      admin.rpc("complete_extra_stock_walk_in_sale", {
        p_extra_stock_id: extraI,
        p_actor_staff_id: (manager ?? owner ?? holder).id,
        p_payment_method: "online_transfer",
      }),
    ]);
    const saleWins = [firstSale, secondSale].filter((row) => !row.error);
    const saleLosses = [firstSale, secondSale].filter((row) => row.error);
    for (const row of saleWins) {
      const id = (row.data as { order_id?: string } | null)?.order_id;
      if (id) orderIds.push(id);
    }
    check(
      saleWins.length === 1 && saleLosses.length === 1,
      "TEST I: concurrent Sold — exactly one succeeds",
      `${saleWins.length} succeeded`,
    );

    const extraJ = await confirmUnit("J");
    await hold(extraJ);
    const { error: badPay } = await admin.rpc(
      "complete_extra_stock_walk_in_sale",
      {
        p_extra_stock_id: extraJ,
        p_actor_staff_id: holder.id,
        p_payment_method: "cash",
      },
    );
    const { data: extraJAfter } = await admin
      .from("extra_stock")
      .select("sold_at, walk_in_held_until")
      .eq("id", extraJ)
      .single();
    check(Boolean(badPay), "TEST J: invalid payment method fails", rpcMessage(badPay));
    check(
      !extraJAfter?.sold_at && Boolean(extraJAfter?.walk_in_held_until),
      "TEST J: cake stays on Walk-in Hold after payment failure",
    );
  } catch (error) {
    if (error instanceof MigrationBlockedError) {
      console.log(error.message);
      return;
    }
    failed += 1;
    console.log("FAIL — live walk-in sale", error instanceof Error ? error.message : error);
  } finally {
    await cleanup();
  }

  if (failed > 0) {
    throw new Error(`${failed} walk-in sale live check(s) failed`);
  }
  console.log("EXTRA walk-in sale live DEV probe passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
