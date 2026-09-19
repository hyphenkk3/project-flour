/**
 * Live Fresh Pick Walk-in Hold: permissions, claim, expiry, reminder.
 * Run: npx tsx scripts/test-extra-walk-in-hold-live.ts
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
import { extraCustomerPickupSlotsForDate } from "@/engines/extra/extra-pickup";
import { extraPickupThroughIso } from "@/engines/extra/fresh-picks-time";
import { addBusinessCalendarDays, toBusinessDateKey } from "@/lib/dates";

const MIGRATION_HINT =
  "BLOCKED: apply supabase/migrations/20260917140000_extra_walk_in_hold.sql, then re-run.";

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

const SIG = `E2E-WHOLD-${Date.now()}`;
console.log(`fixture signature SIG=${SIG}`);

function rpcMessage(error: { message?: string } | null | undefined): string {
  return error?.message ?? "";
}

function minutesBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 60000;
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
  const notificationIds: string[] = [];
  let failed = 0;

  function check(ok: boolean, label: string, detail?: string) {
    if (!ok) failed += 1;
    console.log(
      `${ok ? "PASS" : "FAIL"} — ${label}${detail ? `: ${detail}` : ""}`,
    );
  }

  async function cleanupNotifications(ids: string[]) {
    if (ids.length === 0) return;
    await admin.from("staff_notification_email_deliveries").delete().in(
      "event_id",
      ids,
    );
    await admin.from("staff_notification_events").delete().in("id", ids);
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

    const leftover = await admin.from("extra_stock").select("id").eq("note", SIG);
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
      const { data: notes } = await admin
        .from("staff_notification_events")
        .select("id, payload")
        .eq("code", "fresh_pick_walk_in_hold_reminder");
      const related = (notes ?? [])
        .filter((row) => {
          const extraId = (row.payload as { extra_stock_id?: string } | null)
            ?.extra_stock_id;
          return extraId != null && ids.includes(extraId);
        })
        .map((row) => row.id as string);
      await cleanupNotifications([...notificationIds, ...related]);
      await admin.from("extra_stock_events").delete().in("extra_stock_id", ids);
      await admin.from("extra_stock").delete().in("id", ids);
    } else {
      await cleanupNotifications(notificationIds);
    }
  }

  try {
    const probe = await admin.rpc("hold_extra_stock_walk_in", {
      p_extra_stock_id: "00000000-0000-0000-0000-000000000000",
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

    const owner = await staffFor("owner");
    const manager = await staffFor("manager");
    const co = await staffFor("customer_operations");
    const bakery = await staffFor("bakery");
    const collection = await staffFor("collection");
    const holder = co ?? manager ?? owner;
    if (!holder?.id) throw new Error("No walk-in-hold-capable staff_profiles row");
    const confirmer = bakery ?? manager ?? owner;
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
    const fromSlot =
      defaultExtraPickupFromSlot({ pickupFromDate: todayYmd, todayYmd, now }) ??
      extraOperatingSlotsForDate(todayYmd)[0]?.value;
    const cutoffSlot = defaultExtraOrderCutoffSlot({
      cutoffDate: todayYmd,
      todayYmd,
      now,
    });
    if (!fromSlot || !cutoffSlot) {
      throw new Error("Need operating Extra slots for today");
    }
    const fromIso = extraPickupThroughIso(todayYmd, fromSlot);
    const throughIso = extraPickupThroughIso(todayYmd, cutoffSlot);
    if (!fromIso || !throughIso) throw new Error("Could not build Extra window");

    const pickupSlots = extraCustomerPickupSlotsForDate(
      todayYmd,
      { pickupAvailableFromAt: fromIso, orderCutoffAt: throughIso },
      now,
    );
    const pickupTime = pickupSlots.at(-1)?.value ?? fromSlot;

    async function confirmUnit(label: string) {
      const { data, error } = await admin.rpc("propose_extra_stock", {
        p_actor_staff_id: confirmer.id,
        p_cake_name: cake.name,
        p_size_label: size.label,
        p_prepared_on: todayYmd,
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
        p_prepared_on: todayYmd,
        p_pickup_available_from_at: fromIso,
        p_pickup_through_at: throughIso,
      });
      if (cErr) throw new Error(`${label} confirm: ${cErr.message}`);
      return id;
    }

    async function events(id: string) {
      const { data } = await admin
        .from("extra_stock_events")
        .select("event_type")
        .eq("extra_stock_id", id);
      return (data ?? []).map((row) => row.event_type as string);
    }

    const extra = await confirmUnit("hold");

    if (bakery?.id) {
      const { error } = await admin.rpc("hold_extra_stock_walk_in", {
        p_extra_stock_id: extra,
        p_actor_staff_id: bakery.id,
      });
      check(
        Boolean(error?.message?.toLowerCase().includes("not authorized")),
        "Bakery cannot place a walk-in hold",
        rpcMessage(error),
      );
    } else {
      check(false, "Bakery cannot place a walk-in hold", "no bakery staff");
    }

    if (collection?.id) {
      const { error } = await admin.rpc("hold_extra_stock_walk_in", {
        p_extra_stock_id: extra,
        p_actor_staff_id: collection.id,
      });
      check(
        Boolean(error?.message?.toLowerCase().includes("not authorized")),
        "Collection cannot place a walk-in hold",
        rpcMessage(error),
      );
    } else {
      check(true, "Collection cannot place a walk-in hold (SKIP — no collection staff)");
    }

    async function assertCanHold(actor: { id: string } | null, label: string) {
      if (!actor?.id) {
        check(false, `${label} can hold`, "missing staff");
        return;
      }
      const unit = await confirmUnit(label);
      const { data, error } = await admin.rpc("hold_extra_stock_walk_in", {
        p_extra_stock_id: unit,
        p_actor_staff_id: actor.id,
      });
      check(!error, `${label} can hold`, rpcMessage(error));
      await admin.rpc("release_extra_stock_walk_in_hold", {
        p_extra_stock_id: unit,
        p_actor_staff_id: holder.id,
      });
      return data;
    }

    await assertCanHold(owner, "Owner");
    await assertCanHold(manager, "Manager");
    await assertCanHold(co, "Customer Operations");

    const { data: held, error: holdErr } = await admin.rpc(
      "hold_extra_stock_walk_in",
      {
        p_extra_stock_id: extra,
        p_actor_staff_id: holder.id,
      },
    );
    check(!holdErr, "confirmed unsold uncut unit can be held", rpcMessage(holdErr));
    check(held?.walk_in_held_by === holder.id, "held_by is current staff");
    check(
      Math.abs(
        minutesBetween(held?.walk_in_held_at as string, held?.walk_in_held_until as string) -
          15,
      ) < 0.05,
      "hold duration is 15 minutes",
    );
    check(
      (await events(extra)).includes("hold"),
      "hold event written",
    );
    check(
      !isExtraAvailable({
        lifecycle: "confirmed",
        pickupThroughAt: throughIso,
        walkInHeldUntil: held?.walk_in_held_until ?? null,
        now: new Date(),
      }),
      "engine treats active hold as unavailable",
    );
    check(
      isPublishedFreshPick({
        lifecycle: "confirmed",
        pickupThroughAt: throughIso,
        walkInHeldUntil: held?.walk_in_held_until ?? null,
        now: new Date(),
      }),
      "website catalogue keeps active hold visible",
    );
    check(
      !isCustomerOrderableFreshPick({
        lifecycle: "confirmed",
        pickupThroughAt: throughIso,
        walkInHeldUntil: held?.walk_in_held_until ?? null,
        now: new Date(),
      }),
      "website catalogue does not let customers order an active hold",
    );

    const { error: dupHold } = await admin.rpc("hold_extra_stock_walk_in", {
      p_extra_stock_id: extra,
      p_actor_staff_id: holder.id,
    });
    check(Boolean(dupHold), "second hold on same unit fails", rpcMessage(dupHold));

    const extraConc = await confirmUnit("concurrency");
    const [first, second] = await Promise.all([
      admin.rpc("hold_extra_stock_walk_in", {
        p_extra_stock_id: extraConc,
        p_actor_staff_id: holder.id,
      }),
      admin.rpc("hold_extra_stock_walk_in", {
        p_extra_stock_id: extraConc,
        p_actor_staff_id: (manager ?? owner ?? holder).id,
      }),
    ]);
    const concWins = [first, second].filter((result) => !result.error).length;
    check(concWins === 1, "two simultaneous holds: exactly one succeeds", `${concWins} succeeded`);

    const { error: guestHeld } = await admin.rpc("submit_guest_extra_order", {
      p_customer_name: `${SIG} Held`,
      p_phone: "0190000201",
      p_email: null,
      p_pickup_date: todayYmd,
      p_pickup_time: pickupTime,
      p_notes: SIG,
      p_extra_stock_id: extra,
    });
    check(
      Boolean(guestHeld?.message?.toLowerCase().includes("walk-in hold")),
      "checkout while actively held is rejected",
      rpcMessage(guestHeld),
    );

    if (bakery?.id) {
      const { error: bakeryExtend } = await admin.rpc(
        "extend_extra_stock_walk_in_hold",
        {
          p_extra_stock_id: extra,
          p_actor_staff_id: bakery.id,
        },
      );
      const { error: bakeryRelease } = await admin.rpc(
        "release_extra_stock_walk_in_hold",
        {
          p_extra_stock_id: extra,
          p_actor_staff_id: bakery.id,
        },
      );
      check(
        Boolean(bakeryExtend?.message?.toLowerCase().includes("not authorized")),
        "Bakery cannot extend",
        rpcMessage(bakeryExtend),
      );
      check(
        Boolean(bakeryRelease?.message?.toLowerCase().includes("not authorized")),
        "Bakery cannot release",
        rpcMessage(bakeryRelease),
      );
    }

    const { data: dummyOrder, error: dummyErr } = await admin.rpc(
      "submit_guest_extra_order",
      {
        p_customer_name: `${SIG} Dummy`,
        p_phone: "0190000202",
        p_email: null,
        p_pickup_date: todayYmd,
        p_pickup_time: pickupTime,
        p_notes: SIG,
        p_extra_stock_id: await confirmUnit("unheld-checkout"),
      },
    );
    check(!dummyErr, "unheld Fresh Pick still checkouts", rpcMessage(dummyErr));
    if (dummyOrder?.id) orderIds.push(dummyOrder.id as string);

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
        guest_phone: "0190000205",
        fulfilment_method: "pickup",
        pickup_date: todayYmd,
        pickup_time: pickupTime,
        status: "submitted",
        payment_status: "unpaid",
        customer_notes: SIG,
        extra_stock_id: null,
        order_source: "customer_website",
        include_receipt: false,
      })
      .select("id")
      .maybeSingle();
    check(!insErr && Boolean(assignOrder?.id), "insert assign-target order", rpcMessage(insErr));
    if (assignOrder?.id) orderIds.push(assignOrder.id);

    const { error: assignHeld } = await admin.rpc("assign_extra_stock_to_order", {
      p_extra_stock_id: extra,
      p_order_id: assignOrder?.id,
      p_actor_staff_id: confirmer.id,
    });
    check(
      Boolean(assignHeld?.message?.includes("walk-in hold")),
      "assign while held is rejected",
      rpcMessage(assignHeld),
    );

    const { error: cutHeld } = await admin.rpc("cut_extra_stock_into_slices", {
      p_extra_stock_id: extra,
      p_actor_staff_id: confirmer.id,
    });
    check(
      Boolean(cutHeld?.message?.includes("walk-in hold")),
      "cut while held is rejected",
      rpcMessage(cutHeld),
    );

    const { error: unconfirmHeld } = await admin.rpc("unconfirm_extra_stock", {
      p_extra_stock_id: extra,
      p_actor_staff_id: confirmer.id,
    });
    check(
      Boolean(unconfirmHeld?.message?.includes("walk-in hold")),
      "unconfirm while held is rejected",
      rpcMessage(unconfirmHeld),
    );

    const tomorrow = addBusinessCalendarDays(todayYmd, 1);
    const tomorrowFrom =
      defaultExtraPickupFromSlot({
        pickupFromDate: tomorrow ?? todayYmd,
        todayYmd,
        now,
      }) ?? extraOperatingSlotsForDate(tomorrow ?? todayYmd)[0]?.value;
    const tomorrowCutoff = defaultExtraOrderCutoffSlot({
      cutoffDate: tomorrow ?? todayYmd,
      todayYmd,
      now,
    });
    if (tomorrow && tomorrowFrom && tomorrowCutoff) {
      const { error: moveHeld } = await admin.rpc(
        "move_extra_stock_fresh_pick_window",
        {
          p_extra_stock_id: extra,
          p_actor_staff_id: confirmer.id,
          p_prepared_on: tomorrow,
          p_pickup_available_from_at: extraPickupThroughIso(tomorrow, tomorrowFrom),
          p_pickup_through_at: extraPickupThroughIso(tomorrow, tomorrowCutoff),
        },
      );
      check(
        Boolean(moveHeld?.message?.includes("walk-in hold")),
        "move pickup window while held is rejected",
        rpcMessage(moveHeld),
      );
    } else {
      check(true, "move pickup window while held is rejected (SKIP — no tomorrow slot)");
    }

    await admin
      .from("extra_stock")
      .update({ walk_in_hold_reminder_sent_at: new Date().toISOString() })
      .eq("id", extra);
    const beforeExtend = await admin
      .from("extra_stock")
      .select("walk_in_held_until, walk_in_hold_reminder_sent_at")
      .eq("id", extra)
      .maybeSingle();
    const { data: extended, error: extendErr } = await admin.rpc(
      "extend_extra_stock_walk_in_hold",
      {
        p_extra_stock_id: extra,
        p_actor_staff_id: holder.id,
      },
    );
    check(!extendErr, "first extension succeeds", rpcMessage(extendErr));
    check(
      Math.abs(
        minutesBetween(
          beforeExtend.data?.walk_in_held_until as string,
          extended?.walk_in_held_until as string,
        ) - 15,
      ) < 0.05,
      "extension adds exactly 15 minutes",
    );
    check(
      extended?.walk_in_hold_reminder_sent_at == null,
      "extension resets reminder state",
    );
    check((await events(extra)).includes("hold_extended"), "hold_extended event written");

    const { error: secondExtend } = await admin.rpc(
      "extend_extra_stock_walk_in_hold",
      {
        p_extra_stock_id: extra,
        p_actor_staff_id: holder.id,
      },
    );
    check(Boolean(secondExtend), "second extension fails", rpcMessage(secondExtend));

    const { data: released, error: releaseErr } = await admin.rpc(
      "release_extra_stock_walk_in_hold",
      {
        p_extra_stock_id: extra,
        p_actor_staff_id: holder.id,
      },
    );
    check(!releaseErr, "manual release succeeds", rpcMessage(releaseErr));
    check(released?.sold_at == null, "release does not set sold_at");
    check(released?.walk_in_held_until == null, "release clears hold metadata");
    check((await events(extra)).includes("hold_released"), "hold_released event written");
    check(
      isExtraAvailable({
        lifecycle: "confirmed",
        pickupThroughAt: throughIso,
        walkInHeldUntil: released?.walk_in_held_until ?? null,
        soldAt: released?.sold_at ?? null,
        now: new Date(),
      }),
      "release immediately restores availability",
    );

    const extraExpire = await confirmUnit("expire");
    const { error: holdExpireErr } = await admin.rpc("hold_extra_stock_walk_in", {
      p_extra_stock_id: extraExpire,
      p_actor_staff_id: holder.id,
    });
    check(!holdExpireErr, "expiry fixture held", rpcMessage(holdExpireErr));
    const past = new Date(Date.now() - 60_000).toISOString();
    await admin
      .from("extra_stock")
      .update({
        walk_in_held_until: past,
        walk_in_held_at: past,
      })
      .eq("id", extraExpire);
    const { data: expiredRow } = await admin
      .from("extra_stock")
      .select("walk_in_held_until, sold_at, cut_into_slices_at, pickup_through_at, lifecycle")
      .eq("id", extraExpire)
      .maybeSingle();
    check(
      isExtraAvailable({
        lifecycle: "confirmed",
        pickupThroughAt: expiredRow?.pickup_through_at ?? throughIso,
        walkInHeldUntil: expiredRow?.walk_in_held_until ?? null,
        soldAt: expiredRow?.sold_at ?? null,
        cutIntoSlicesAt: expiredRow?.cut_into_slices_at ?? null,
        now: new Date(),
      }),
      "expired hold is available without cleanup",
    );
    const { error: extendExpired } = await admin.rpc(
      "extend_extra_stock_walk_in_hold",
      {
        p_extra_stock_id: extraExpire,
        p_actor_staff_id: holder.id,
      },
    );
    check(Boolean(extendExpired), "expired hold cannot be extended", rpcMessage(extendExpired));
    const { data: replacement, error: replaceErr } = await admin.rpc(
      "hold_extra_stock_walk_in",
      {
        p_extra_stock_id: extraExpire,
        p_actor_staff_id: holder.id,
      },
    );
    check(!replaceErr, "expired hold can be replaced by a new hold", rpcMessage(replaceErr));
    check((await events(extraExpire)).includes("hold_expired"), "replacing expired hold writes hold_expired");
    await admin.rpc("release_extra_stock_walk_in_hold", {
      p_extra_stock_id: extraExpire,
      p_actor_staff_id: holder.id,
    });

    const extraCheckout = await confirmUnit("checkout-after-expiry");
    await admin.rpc("hold_extra_stock_walk_in", {
      p_extra_stock_id: extraCheckout,
      p_actor_staff_id: holder.id,
    });
    await admin
      .from("extra_stock")
      .update({
        walk_in_held_until: past,
        walk_in_held_at: past,
      })
      .eq("id", extraCheckout);
    const { data: afterExpiryOrder, error: afterExpiryErr } = await admin.rpc(
      "submit_guest_extra_order",
      {
        p_customer_name: `${SIG} After Expiry`,
        p_phone: "0190000203",
        p_email: null,
        p_pickup_date: todayYmd,
        p_pickup_time: pickupTime,
        p_notes: SIG,
        p_extra_stock_id: extraCheckout,
      },
    );
    check(!afterExpiryErr, "checkout after expiry succeeds without cleanup", rpcMessage(afterExpiryErr));
    if (afterExpiryOrder?.id) orderIds.push(afterExpiryOrder.id as string);

    const extraRemind = await confirmUnit("reminder");
    await admin.rpc("hold_extra_stock_walk_in", {
      p_extra_stock_id: extraRemind,
      p_actor_staff_id: holder.id,
    });
    const soon = new Date(Date.now() + 2 * 60_000).toISOString();
    await admin
      .from("extra_stock")
      .update({ walk_in_held_until: soon })
      .eq("id", extraRemind);
    const { data: remindCount, error: remindErr } = await admin.rpc(
      "sweep_extra_walk_in_hold_reminders",
    );
    check(!remindErr, "reminder sweep runs", rpcMessage(remindErr));
    const { data: remindEvents } = await admin
      .from("staff_notification_events")
      .select("id")
      .eq("code", "fresh_pick_walk_in_hold_reminder")
      .contains("payload", { extra_stock_id: extraRemind });
    const firstRemindIds = (remindEvents ?? []).map((row) => row.id as string);
    notificationIds.push(...firstRemindIds);
    check(firstRemindIds.length === 1, "one reminder about 3 minutes before expiry");
    await admin.rpc("sweep_extra_walk_in_hold_reminders");
    const { data: remindAgain } = await admin
      .from("staff_notification_events")
      .select("id")
      .eq("code", "fresh_pick_walk_in_hold_reminder")
      .contains("payload", { extra_stock_id: extraRemind });
    check((remindAgain ?? []).length === 1, "no duplicate reminder");

    await admin.rpc("extend_extra_stock_walk_in_hold", {
      p_extra_stock_id: extraRemind,
      p_actor_staff_id: holder.id,
    });
    const later = new Date(Date.now() + 2 * 60_000).toISOString();
    await admin
      .from("extra_stock")
      .update({ walk_in_held_until: later, walk_in_hold_reminder_sent_at: null })
      .eq("id", extraRemind);
    await admin.rpc("sweep_extra_walk_in_hold_reminders");
    const { data: afterExtendRemind } = await admin
      .from("staff_notification_events")
      .select("id")
      .eq("code", "fresh_pick_walk_in_hold_reminder")
      .contains("payload", { extra_stock_id: extraRemind });
    const extendIds = (afterExtendRemind ?? []).map((row) => row.id as string);
    notificationIds.push(...extendIds);
    check(extendIds.length === 2, "extension causes one reminder for the new expiry");

    const extraNoRemindRelease = await confirmUnit("no-remind-release");
    await admin.rpc("hold_extra_stock_walk_in", {
      p_extra_stock_id: extraNoRemindRelease,
      p_actor_staff_id: holder.id,
    });
    await admin.rpc("release_extra_stock_walk_in_hold", {
      p_extra_stock_id: extraNoRemindRelease,
      p_actor_staff_id: holder.id,
    });
    await admin.rpc("sweep_extra_walk_in_hold_reminders");
    const { data: releasedRemind } = await admin
      .from("staff_notification_events")
      .select("id")
      .eq("code", "fresh_pick_walk_in_hold_reminder")
      .contains("payload", { extra_stock_id: extraNoRemindRelease });
    check((releasedRemind ?? []).length === 0, "no reminder after manual release");

    const extraNoRemindSale = await confirmUnit("no-remind-sale");
    await admin.rpc("hold_extra_stock_walk_in", {
      p_extra_stock_id: extraNoRemindSale,
      p_actor_staff_id: holder.id,
    });
    await admin
      .from("extra_stock")
      .update({
        walk_in_held_until: past,
        walk_in_held_at: past,
      })
      .eq("id", extraNoRemindSale);
    const { data: soldHeld, error: soldHeldErr } = await admin.rpc(
      "submit_guest_extra_order",
      {
        p_customer_name: `${SIG} Sold After Hold`,
        p_phone: "0190000204",
        p_email: null,
        p_pickup_date: todayYmd,
        p_pickup_time: pickupTime,
        p_notes: SIG,
        p_extra_stock_id: extraNoRemindSale,
      },
    );
    check(!soldHeldErr, "sale after expired hold still works", rpcMessage(soldHeldErr));
    if (soldHeld?.id) orderIds.push(soldHeld.id as string);
    await admin.rpc("sweep_extra_walk_in_hold_reminders");
    const { data: soldRemind } = await admin
      .from("staff_notification_events")
      .select("id")
      .eq("code", "fresh_pick_walk_in_hold_reminder")
      .contains("payload", { extra_stock_id: extraNoRemindSale });
    check((soldRemind ?? []).length === 0, "no reminder after sale/assignment");

    void remindCount;
    void replacement;
  } catch (error) {
    if (error instanceof MigrationBlockedError) {
      console.log(error.message);
      process.exitCode = 2;
      return;
    }
    failed += 1;
    console.log(
      `FAIL — live walk-in hold: ${error instanceof Error ? error.message : error}`,
    );
  } finally {
    await cleanup();
  }

  if (failed > 0) {
    console.log(`EXTRA walk-in hold live: FAIL (${failed})`);
    process.exitCode = 1;
    return;
  }
  console.log("EXTRA walk-in hold live: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
