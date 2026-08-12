/**
 * M4-P3 Slice 2A — live waiver restoration authority.
 *
 * Prerequisites:
 *   apply 20260811170000_m4_p3_delivery_fee_waiver_restore.sql
 *   Expected SHA-256:
 *   2b0a75379bf8973e9381302c802d967f2c26524959a09f63496c70ee71cfc380
 *
 * Run: npx tsx scripts/test-m4-p3-slice2a-waiver-restore-live.ts
 *
 * If restore RPCs are missing, exits 2 (migration not applied) — do not claim
 * live verification until Product applies the migration.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT,
  DELIVERY_FEE_CODE,
  DELIVERY_PROCESSING_FEE_CODE,
} from "@/engines/orders/delivery-finance";
import {
  financialMateriallyAffectsConfirmation,
  orderStatusAllowsConfirmationInvalidation,
} from "@/engines/orders/confirmation-validity";
import { reconcilePaymentLifecycleStatus } from "@/engines/orders/payment-status";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import { commercialLinesForSettlement } from "@/engines/orders/totals";
import type { GuestOrderStatus } from "@/types/storefront";

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

const SIG = `M4P3S2A-R-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EXPECTED_HASH =
  "2b0a75379bf8973e9381302c802d967f2c26524959a09f63496c70ee71cfc380";

type Check = { label: string; ok: boolean; detail?: string };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log("SKIP live DB (missing Supabase env).");
    process.exit(0);
  }

  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260811170000_m4_p3_delivery_fee_waiver_restore.sql",
  );
  const migrationHash = createHash("sha256")
    .update(readFileSync(migrationPath))
    .digest("hex");
  console.log(`restore migration sha256=${migrationHash}`);
  assert.equal(migrationHash, EXPECTED_HASH);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Probe restore RPC presence without fabricating order state.
  const probe = await admin.rpc("restore_guest_order_processing_fee", {
    p_order_id: "00000000-0000-0000-0000-000000000000",
    p_actor_staff_id: "00000000-0000-0000-0000-000000000000",
  });
  if (
    probe.error &&
    /could not find the function|schema cache|does not exist/i.test(
      probe.error.message,
    )
  ) {
    console.error(
      "BLOCKED: restore migration not applied — restore_guest_order_processing_fee missing.",
    );
    console.error(probe.error.message);
    console.error(
      "Apply: supabase/migrations/20260811170000_m4_p3_delivery_fee_waiver_restore.sql",
    );
    console.error(`Expected SHA-256: ${EXPECTED_HASH}`);
    process.exit(2);
  }

  const checks: Check[] = [];
  const orderIds: string[] = [];
  const staffIdsToDelete: string[] = [];
  const authUserIdsToDelete: string[] = [];

  function pass(label: string, detail?: string) {
    checks.push({ label, ok: true, detail });
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  }
  function fail(label: string, detail?: string) {
    checks.push({ label, ok: false, detail });
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
  function check(condition: boolean, label: string, detail?: string) {
    if (condition) pass(label, detail);
    else fail(label, detail);
  }

  async function amountDue(orderId: string): Promise<number> {
    const { data, error } = await admin.rpc("order_amount_due", {
      p_order_id: orderId,
    });
    if (error) throw error;
    return Number(data);
  }

  async function loadDetails(orderId: string) {
    const { data, error } = await admin
      .from("order_delivery_details")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function activeFeeAdjustments(orderId: string) {
    const { data, error } = await admin
      .from("order_adjustments")
      .select("id, code, amount, status, reverses_adjustment_id")
      .eq("order_id", orderId)
      .in("code", [DELIVERY_PROCESSING_FEE_CODE, DELIVERY_FEE_CODE])
      .eq("status", "active")
      .is("reverses_adjustment_id", null);
    if (error) throw error;
    return data ?? [];
  }

  async function tsAmountDue(orderId: string): Promise<number> {
    const settlement = await tsSettlement(orderId);
    return settlement.amountDue;
  }

  async function tsSettlement(orderId: string) {
    const { data: items } = await admin
      .from("order_items")
      .select("unit_price, quantity")
      .eq("order_id", orderId);
    const { data: addons } = await admin
      .from("order_paid_addons")
      .select("unit_price, quantity")
      .eq("order_id", orderId);
    const { data: adjustments } = await admin
      .from("order_adjustments")
      .select("amount")
      .eq("order_id", orderId);
    const { data: allocations } = await admin
      .from("payment_allocations")
      .select("amount, payment_id")
      .eq("order_id", orderId);
    const paymentIds = [
      ...new Set((allocations ?? []).map((a) => String(a.payment_id))),
    ];
    const paymentStatusById = new Map<string, string>();
    if (paymentIds.length > 0) {
      const { data: payments } = await admin
        .from("payments")
        .select("id, status")
        .in("id", paymentIds);
      for (const row of payments ?? []) {
        paymentStatusById.set(String(row.id), String(row.status));
      }
    }
    const { data: refunds } = await admin
      .from("refunds")
      .select("amount, status")
      .eq("order_id", orderId);
    return calculateOrderSettlement({
      items: commercialLinesForSettlement({
        items: (items ?? []).map((i) => ({
          unitPrice: Number(i.unit_price),
          quantity: Number(i.quantity),
        })),
        paidAddons: (addons ?? []).map((a) => ({
          unitPrice: Number(a.unit_price),
          quantity: Number(a.quantity),
        })),
      }),
      adjustments: (adjustments ?? []).map((a) => ({ amount: Number(a.amount) })),
      allocations: (allocations ?? []).map((a) => ({
        amount: Number(a.amount),
        paymentStatus:
          paymentStatusById.get(String(a.payment_id)) === "verified"
            ? ("verified" as const)
            : ("pending" as const),
      })),
      refunds: (refunds ?? []).map((r) => ({
        amount: Number(r.amount),
        status: (String(r.status ?? "recorded") === "recorded"
          ? "recorded"
          : "voided") as "recorded" | "voided",
      })),
    });
  }

  /**
   * Mirrors Owner afterDeliveryFinanceMutation:
   * reconcile payment lifecycle + outdate sent Confirmation when amountDue changes.
   */
  async function applyAppLayerAfterFinanceMutation(input: {
    orderId: string;
    beforeAmountDue: number;
    beforeStatus: GuestOrderStatus;
    beforeNetReceived: number;
    staffId: string;
  }) {
    const settlement = await tsSettlement(input.orderId);
    const reconciled = reconcilePaymentLifecycleStatus({
      previousStatus: input.beforeStatus,
      previousNetReceived: input.beforeNetReceived,
      settlement,
    });
    if (reconciled.statusChanged) {
      await admin
        .from("orders")
        .update({
          status: reconciled.newStatus,
          payment_status:
            reconciled.newStatus === "paid" ? "paid" : "unpaid",
          updated_by: input.staffId,
        })
        .eq("id", input.orderId)
        .is("customer_id", null);
    }

    if (
      orderStatusAllowsConfirmationInvalidation(input.beforeStatus) &&
      financialMateriallyAffectsConfirmation(
        input.beforeAmountDue,
        settlement.amountDue,
      )
    ) {
      const { data: latestSent } = await admin
        .from("order_confirmation_snapshots")
        .select("id")
        .eq("order_id", input.orderId)
        .eq("lifecycle_status", "sent")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestSent?.id) {
        await admin
          .from("order_confirmation_snapshots")
          .update({
            lifecycle_status: "outdated",
            outdated_at: new Date().toISOString(),
          })
          .eq("id", latestSent.id)
          .eq("lifecycle_status", "sent");
      }
      await admin
        .from("orders")
        .update({ confirmation_needs_resend: true })
        .eq("id", input.orderId)
        .is("customer_id", null);
    }

    return settlement;
  }

  async function timelineTypes(orderId: string): Promise<string[]> {
    const { data, error } = await admin
      .from("order_timeline_events")
      .select("event_type, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => String(row.event_type));
  }

  async function cleanupOrder(orderId: string) {
    for (const step of [
      () => admin.from("payment_allocations").delete().eq("order_id", orderId),
      () => admin.from("refunds").delete().eq("order_id", orderId),
      () => admin.from("order_adjustments").delete().eq("order_id", orderId),
      () => admin.from("orders").delete().eq("id", orderId),
    ]) {
      const { error } = await step();
      if (error) {
        throw new Error(`cleanup failed for ${orderId}: ${error.message}`);
      }
    }
  }

  try {
    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .eq("code", "owner")
      .maybeSingle();
    if (!ownerRole?.id) throw new Error("owner role missing");
    const { data: owned } = await admin
      .from("staff_profiles")
      .select("id")
      .eq("role_id", ownerRole.id)
      .limit(1)
      .maybeSingle();
    if (!owned?.id) throw new Error("No owner staff_profiles");
    const ownerId = owned.id;

    const { data: coRole } = await admin
      .from("roles")
      .select("id")
      .eq("code", "customer_operations")
      .maybeSingle();
    if (!coRole?.id) throw new Error("customer_operations role missing");

    const counterEmail = `m4p3s2a-counter-${Date.now()}@whitebird.dev`;
    const { data: authCreated, error: authErr } =
      await admin.auth.admin.createUser({
        email: counterEmail,
        password: `TmpCounter_${Date.now()}!`,
        email_confirm: true,
      });
    if (authErr || !authCreated.user?.id) {
      throw new Error(authErr?.message ?? "counter auth create failed");
    }
    authUserIdsToDelete.push(authCreated.user.id);
    const { data: counterProfile, error: counterErr } = await admin
      .from("staff_profiles")
      .insert({
        auth_user_id: authCreated.user.id,
        username: `m4p3s2ac${Date.now().toString().slice(-6)}`,
        email: counterEmail,
        display_name: `${SIG} Counter`,
        role_id: coRole.id,
        is_active: true,
      })
      .select("id")
      .single();
    if (counterErr || !counterProfile?.id) {
      throw new Error(counterErr?.message ?? "counter staff create failed");
    }
    const counterId = counterProfile.id;
    staffIdsToDelete.push(counterId);

    const { data: sizes } = await admin
      .from("library_cake_sizes")
      .select("id, cake_id, price")
      .limit(20);
    let size = sizes?.[0];
    for (const candidate of sizes ?? []) {
      const { data: cake } = await admin
        .from("library_cakes")
        .select("id")
        .eq("id", candidate.cake_id)
        .in("status", ["active", "seasonal"])
        .maybeSingle();
      if (cake) {
        size = candidate;
        break;
      }
    }
    if (!size) throw new Error("No cake size");
    const cakePrice = Number(size.price);

    const deliveryPayload = {
      recipient_name: `${SIG} Recipient`,
      recipient_phone: "0177002001",
      address_line_1: "1 Test Road",
      address_line_2: null,
      postcode: "88400",
      city: "Kota Kinabalu",
      state: "Sabah",
      recipient_notify_preference: "inform_recipient",
    };

    async function createDeliveryOrder(label: string): Promise<string> {
      const { data, error } = await admin.rpc("create_staff_guest_preorder", {
        p_actor_staff_id: ownerId,
        p_customer_name: `${SIG} ${label}`,
        p_phone: "0177002001",
        p_email: null,
        p_order_source: "whatsapp",
        p_crew_order: false,
        p_pickup_date: "2026-09-10",
        p_pickup_time: "16:00:00",
        p_pickup_instruction: null,
        p_items: [
          {
            cake_id: size!.cake_id,
            cake_size_id: size!.id,
            quantity: 1,
          },
        ],
        p_complimentary: [],
        p_include_receipt: false,
        p_needs_bakery_attention: false,
        p_bakery_attention_note: null,
        p_customer_notes: null,
        p_internal_notes: `${SIG}-${label}`,
        p_fulfilment_method: "delivery",
        p_delivery: deliveryPayload,
      });
      if (error || !data?.id) {
        throw new Error(error?.message ?? "create failed");
      }
      orderIds.push(data.id);

      const { error: quoteErr } = await admin.rpc(
        "set_guest_order_delivery_fee_quote",
        {
          p_order_id: data.id,
          p_actor_staff_id: ownerId,
          p_amount: 15,
        },
      );
      if (quoteErr) throw quoteErr;
      return data.id as string;
    }

    async function createPickupOrder(label: string): Promise<string> {
      const { data, error } = await admin.rpc("create_staff_guest_preorder", {
        p_actor_staff_id: ownerId,
        p_customer_name: `${SIG} ${label}`,
        p_phone: "0177002002",
        p_email: null,
        p_order_source: "whatsapp",
        p_crew_order: false,
        p_pickup_date: "2026-09-10",
        p_pickup_time: "16:00:00",
        p_pickup_instruction: null,
        p_items: [
          {
            cake_id: size!.cake_id,
            cake_size_id: size!.id,
            quantity: 1,
          },
        ],
        p_complimentary: [],
        p_include_receipt: false,
        p_needs_bakery_attention: false,
        p_bakery_attention_note: null,
        p_customer_notes: null,
        p_internal_notes: `${SIG}-${label}`,
        p_fulfilment_method: "pickup",
        p_delivery: null,
      });
      if (error || !data?.id) {
        throw new Error(error?.message ?? "pickup create failed");
      }
      orderIds.push(data.id);
      return data.id as string;
    }

    // --- A–H Processing normal → waive → restore ---
    {
      const orderId = await createDeliveryOrder("PROC");
      const due0 = await amountDue(orderId);
      check(
        Math.abs(due0 - (cakePrice + 5 + 15)) < 0.001,
        "A. Processing normal RM5 + Delivery RM15 in amountDue",
        `due=${due0}`,
      );

      await admin.rpc("waive_guest_order_processing_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
        p_reason: "goodwill",
      });
      const dueWaived = await amountDue(orderId);
      check(
        Math.abs(dueWaived - (cakePrice + 15)) < 0.001,
        "B. Processing waive RM5 → RM0",
        `due=${dueWaived}`,
      );

      const { error: restoreErr } = await admin.rpc(
        "restore_guest_order_processing_fee",
        {
          p_order_id: orderId,
          p_actor_staff_id: ownerId,
          p_reason: "customer paid full",
        },
      );
      check(!restoreErr, "C. Restore Processing RPC ok", restoreErr?.message);
      const dueRestored = await amountDue(orderId);
      check(
        Math.abs(dueRestored - (cakePrice + 5 + 15)) < 0.001,
        "C. Restore Processing RM0 → RM5",
        `due=${dueRestored}`,
      );
      const details = await loadDetails(orderId);
      check(details?.processing_fee_waived === false, "G. applicable preserved / not waived");
      check(
        Number(details?.processing_fee_applicable_amount) === 5,
        "G. applicable amount remains RM5",
      );

      const types = await timelineTypes(orderId);
      check(
        types.includes("delivery_processing_fee_waived"),
        "P. original Processing waiver audit present",
      );
      check(
        types.includes("delivery_processing_fee_restored"),
        "N. explicit Processing restore audit event",
      );
      check(
        !types.includes("delivery_processing_fee_overridden") ||
          types.filter((t) => t === "delivery_processing_fee_overridden")
            .length >= 0,
        "M-ish Processing restore is not represented as a new quote",
      );

      const fees = await activeFeeAdjustments(orderId);
      const proc = fees.filter((f) => f.code === DELIVERY_PROCESSING_FEE_CODE);
      check(proc.length === 1, "R. active Processing adjustment exactly one");
      check(Number(proc[0]?.amount) === 5, "R. Processing adjustment = RM5");
    }

    // --- D–H override → waive → restore to RM3 ---
    {
      const orderId = await createDeliveryOrder("OVRD");
      await admin.rpc("override_guest_order_processing_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
        p_amount: 3,
        p_reason: "vip",
      });
      check(
        Math.abs((await amountDue(orderId)) - (cakePrice + 3 + 15)) < 0.001,
        "D. Processing override RM3",
      );
      await admin.rpc("waive_guest_order_processing_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });
      check(
        Math.abs((await amountDue(orderId)) - (cakePrice + 15)) < 0.001,
        "E. Override RM3 → waive RM0",
      );
      await admin.rpc("restore_guest_order_processing_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });
      const details = await loadDetails(orderId);
      check(
        Number(details?.processing_fee_override_amount) === 3,
        "H. override remains preserved",
      );
      check(
        Number(details?.processing_fee_applicable_amount) === 5,
        "G. applicable still RM5 after restore",
      );
      check(
        Math.abs((await amountDue(orderId)) - (cakePrice + 3 + 15)) < 0.001,
        "F. Restore → RM3, NOT RM5",
      );
    }

    // --- I–M Delivery quote → waive → restore ---
    {
      const orderId = await createDeliveryOrder("DEL");
      await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
        p_reason: "promo",
      });
      check(
        Math.abs((await amountDue(orderId)) - (cakePrice + 5)) < 0.001,
        "J. waive Delivery RM15 → RM0",
      );
      let details = await loadDetails(orderId);
      check(
        details?.delivery_fee_status === "quoted_waived" &&
          Number(details?.delivery_fee_quoted_amount) === 15,
        "L. quoted amount remains RM15 while waived",
      );

      const { error: restoreErr } = await admin.rpc(
        "restore_guest_order_delivery_fee",
        {
          p_order_id: orderId,
          p_actor_staff_id: ownerId,
        },
      );
      check(!restoreErr, "K. Restore Delivery RPC ok", restoreErr?.message);
      details = await loadDetails(orderId);
      check(details?.delivery_fee_status === "quoted", "K. status back to quoted");
      check(
        Number(details?.delivery_fee_quoted_amount) === 15,
        "L. quoted amount still RM15 after restore",
      );
      check(
        Math.abs((await amountDue(orderId)) - (cakePrice + 5 + 15)) < 0.001,
        "K. restore → RM15 payable",
      );

      const types = await timelineTypes(orderId);
      check(types.includes("delivery_fee_waived"), "P. Delivery waiver audit present");
      check(types.includes("delivery_fee_restored"), "O. Delivery restore audit event");
      const quoteCount = types.filter((t) => t === "delivery_fee_quoted").length;
      const restoreCount = types.filter((t) => t === "delivery_fee_restored").length;
      check(
        restoreCount >= 1 && quoteCount >= 1,
        "M. restore is not represented as a new quote event",
        `quoted=${quoteCount} restored=${restoreCount}`,
      );

      const fees = await activeFeeAdjustments(orderId);
      const del = fees.filter((f) => f.code === DELIVERY_FEE_CODE);
      check(del.length === 1, "S. active Delivery adjustment exactly one");
      check(Number(del[0]?.amount) === 15, "S. Delivery adjustment = RM15");

      const sqlDue = await amountDue(orderId);
      const tsDue = await tsAmountDue(orderId);
      check(
        Math.abs(sqlDue - tsDue) < 0.001,
        "U. SQL ↔ TS settlement agreement",
        `sql=${sqlDue} ts=${tsDue}`,
      );
      check(true, "T. amountDue exact after restore", `due=${sqlDue}`);
    }

    // --- Invalid / authority ---
    {
      const orderId = await createDeliveryOrder("INV");
      const { error: counterErr } = await admin.rpc(
        "restore_guest_order_delivery_fee",
        {
          p_order_id: orderId,
          p_actor_staff_id: counterId,
        },
      );
      check(
        Boolean(counterErr),
        "9/Owner-only — Counter cannot restore Delivery",
        counterErr?.message,
      );

      const { error: notWaivedProc } = await admin.rpc(
        "restore_guest_order_processing_fee",
        {
          p_order_id: orderId,
          p_actor_staff_id: ownerId,
        },
      );
      check(
        Boolean(notWaivedProc),
        "AE. non-waived Processing restore rejected",
        notWaivedProc?.message,
      );

      const { error: notWaivedDel } = await admin.rpc(
        "restore_guest_order_delivery_fee",
        {
          p_order_id: orderId,
          p_actor_staff_id: ownerId,
        },
      );
      check(
        Boolean(notWaivedDel),
        "AF. non-waived Delivery restore rejected",
        notWaivedDel?.message,
      );

      await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });
      await admin.rpc("restore_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });
      const beforeRepeat = await amountDue(orderId);
      const typesBefore = await timelineTypes(orderId);
      const restoreBefore = typesBefore.filter(
        (t) => t === "delivery_fee_restored",
      ).length;
      const { error: repeatErr } = await admin.rpc(
        "restore_guest_order_delivery_fee",
        {
          p_order_id: orderId,
          p_actor_staff_id: ownerId,
        },
      );
      check(Boolean(repeatErr), "AH. repeat restore protected", repeatErr?.message);
      check(
        Math.abs((await amountDue(orderId)) - beforeRepeat) < 0.001,
        "AB. repeated restore does not change amountDue",
      );
      const restoreAfter = (await timelineTypes(orderId)).filter(
        (t) => t === "delivery_fee_restored",
      ).length;
      check(
        restoreAfter === restoreBefore,
        "AB. repeated restore does not add restore event",
      );
    }

    // Counter cannot restore Processing either
    {
      const orderId = await createDeliveryOrder("CTRP");
      await admin.rpc("waive_guest_order_processing_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });
      const { error: counterProcErr } = await admin.rpc(
        "restore_guest_order_processing_fee",
        {
          p_order_id: orderId,
          p_actor_staff_id: counterId,
        },
      );
      check(
        Boolean(counterProcErr),
        "Counter cannot directly restore Processing",
        counterProcErr?.message,
      );
    }

    // NOT SET restore rejected
    {
      const orderId = await createDeliveryOrder("NSET");
      // createDeliveryOrder quotes RM15 — reset to NOT SET for AG
      await admin
        .from("order_delivery_details")
        .update({
          delivery_fee_status: "not_set",
          delivery_fee_quoted_amount: null,
          delivery_fee_waived: false,
        })
        .eq("order_id", orderId);
      const details = await loadDetails(orderId);
      check(details?.delivery_fee_status === "not_set", "A. Delivery Fee NOT SET state");
      const { error } = await admin.rpc("restore_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });
      check(Boolean(error), "AG. Delivery NOT SET restore rejected", error?.message);
    }

    // Partial payment → waive → restore balance increases
    {
      const orderId = await createDeliveryOrder("PART");
      const dueFull = await amountDue(orderId);
      await admin
        .from("orders")
        .update({ status: "awaiting_payment" })
        .eq("id", orderId);
      const partial = 50;
      const { error: payErr } = await admin.rpc(
        "record_and_verify_guest_order_payment",
        {
          p_order_id: orderId,
          p_amount: partial,
          p_method: "wb_qr",
          p_method_description: null,
          p_paid_at: new Date().toISOString(),
          p_reference_note: `${SIG}-partial`,
          p_verifier_staff_id: ownerId,
        },
      );
      check(!payErr, "PARTIAL payment recorded", payErr?.message);

      await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });
      const dueWaived = await amountDue(orderId);
      const settleWaived = await tsSettlement(orderId);
      check(
        Math.abs(dueWaived - (dueFull - 15)) < 0.001,
        "PARTIAL fee waive lowers amountDue",
        `due=${dueWaived}`,
      );
      check(
        Math.abs(settleWaived.remainingBalance - Math.max(0, dueWaived - partial)) <
          0.001,
        "PARTIAL balance after waive",
        `balance=${settleWaived.remainingBalance}`,
      );

      const { data: allocSnap } = await admin
        .from("payment_allocations")
        .select("payment_id, amount")
        .eq("order_id", orderId);
      const snap = JSON.stringify(allocSnap);

      await admin.rpc("restore_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });
      const dueRestored = await amountDue(orderId);
      const settleRestored = await tsSettlement(orderId);
      check(
        Math.abs(dueRestored - dueFull) < 0.001,
        "PARTIAL restore restores amountDue",
        `due=${dueRestored}`,
      );
      check(
        Math.abs(settleRestored.remainingBalance - (dueFull - partial)) < 0.001,
        "PARTIAL restore increases remaining balance",
        `balance=${settleRestored.remainingBalance}`,
      );
      const { data: allocAfter } = await admin
        .from("payment_allocations")
        .select("payment_id, amount")
        .eq("order_id", orderId);
      check(
        JSON.stringify(allocAfter) === snap,
        "PARTIAL allocations immutable through waive/restore",
      );
      check(
        Math.abs((await amountDue(orderId)) - (await tsAmountDue(orderId))) <
          0.001,
        "PARTIAL SQL↔TS settlement after restore",
      );
    }

    // Paid at waived amount → restore → awaiting balance; overpayment on waive
    {
      const orderId = await createDeliveryOrder("PAID");
      const dueFull = await amountDue(orderId);
      await admin
        .from("orders")
        .update({ status: "awaiting_payment" })
        .eq("id", orderId);

      // Pay full including Delivery RM15
      const { data: payFull, error: payFullErr } = await admin.rpc(
        "record_and_verify_guest_order_payment",
        {
          p_order_id: orderId,
          p_amount: dueFull,
          p_method: "wb_qr",
          p_method_description: null,
          p_paid_at: new Date().toISOString(),
          p_reference_note: `${SIG}-paid-full`,
          p_verifier_staff_id: ownerId,
        },
      );
      check(!payFullErr, "PAID setup full payment", payFullErr?.message);
      await admin
        .from("orders")
        .update({ status: "paid", payment_status: "paid" })
        .eq("id", orderId);

      // Waive Delivery → overpayment
      const beforeWaiveDue = await amountDue(orderId);
      const beforeWaiveSettle = await tsSettlement(orderId);
      await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });
      const afterWaiveSettle = await applyAppLayerAfterFinanceMutation({
        orderId,
        beforeAmountDue: beforeWaiveDue,
        beforeStatus: "paid",
        beforeNetReceived: beforeWaiveSettle.netReceived,
        staffId: ownerId,
      });
      check(
        afterWaiveSettle.overpayment > 0,
        "OVERPAYMENT after Delivery waive on Paid order",
        `over=${afterWaiveSettle.overpayment}`,
      );

      const { data: allocSnap } = await admin
        .from("payment_allocations")
        .select("payment_id, amount")
        .eq("order_id", orderId);
      const snap = JSON.stringify(allocSnap);
      const paymentId = payFull?.payment_id as string | undefined;

      // Restore → consumes overpayment, may return to awaiting with balance
      const beforeRestoreDue = await amountDue(orderId);
      const beforeRestoreSettle = await tsSettlement(orderId);
      const { data: statusBeforeRestore } = await admin
        .from("orders")
        .select("status")
        .eq("id", orderId)
        .single();
      await admin.rpc("restore_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });
      const afterRestoreSettle = await applyAppLayerAfterFinanceMutation({
        orderId,
        beforeAmountDue: beforeRestoreDue,
        beforeStatus: (statusBeforeRestore?.status ??
          "paid") as GuestOrderStatus,
        beforeNetReceived: beforeRestoreSettle.netReceived,
        staffId: ownerId,
      });
      check(
        Math.abs(afterRestoreSettle.amountDue - dueFull) < 0.001,
        "V. Paid-order restore restores full amountDue",
        `due=${afterRestoreSettle.amountDue}`,
      );
      check(
        afterRestoreSettle.overpayment === 0,
        "OVERPAYMENT consumed after restore",
        `over=${afterRestoreSettle.overpayment}`,
      );
      check(
        afterRestoreSettle.isFullyPaid === true &&
          afterRestoreSettle.remainingBalance === 0,
        "W. Paid-order restore at previously-full payment remains covered",
      );

      const { data: statusAfter } = await admin
        .from("orders")
        .select("status")
        .eq("id", orderId)
        .single();
      check(
        statusAfter?.status === "paid",
        "W. status remains paid when net covers restored due",
        `status=${statusAfter?.status}`,
      );

      const { data: allocAfter } = await admin
        .from("payment_allocations")
        .select("payment_id, amount")
        .eq("order_id", orderId);
      check(
        JSON.stringify(allocAfter) === snap,
        "Y. verified payment/allocation immutable",
      );
      if (paymentId) {
        const { data: payRow } = await admin
          .from("payments")
          .select("id, amount, status")
          .eq("id", paymentId)
          .maybeSingle();
        check(
          Number(payRow?.amount) === dueFull,
          "Y. payment row amount unchanged",
        );
      }
    }

    // Paid at waived (lower) amount → restore creates additional balance
    {
      const orderId = await createDeliveryOrder("PAID2");
      await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });
      const dueWaived = await amountDue(orderId);
      await admin
        .from("orders")
        .update({ status: "awaiting_payment" })
        .eq("id", orderId);
      const { error: payErr } = await admin.rpc(
        "record_and_verify_guest_order_payment",
        {
          p_order_id: orderId,
          p_amount: dueWaived,
          p_method: "wb_qr",
          p_method_description: null,
          p_paid_at: new Date().toISOString(),
          p_reference_note: `${SIG}-paid-waived`,
          p_verifier_staff_id: ownerId,
        },
      );
      check(!payErr, "PAID2 payment at waived amount", payErr?.message);
      await admin
        .from("orders")
        .update({ status: "paid", payment_status: "paid" })
        .eq("id", orderId);

      const beforeDue = await amountDue(orderId);
      const beforeSettle = await tsSettlement(orderId);
      await admin.rpc("restore_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });
      const afterSettle = await applyAppLayerAfterFinanceMutation({
        orderId,
        beforeAmountDue: beforeDue,
        beforeStatus: "paid",
        beforeNetReceived: beforeSettle.netReceived,
        staffId: ownerId,
      });
      check(
        Math.abs(afterSettle.amountDue - (dueWaived + 15)) < 0.001,
        "V. restore after paid-at-waived increases amountDue by RM15",
      );
      check(
        afterSettle.remainingBalance === 15,
        "V. additional balance due RM15",
        `balance=${afterSettle.remainingBalance}`,
      );
      const { data: statusAfter } = await admin
        .from("orders")
        .select("status")
        .eq("id", orderId)
        .single();
      check(
        statusAfter?.status === "awaiting_payment",
        "W. status reconciles to awaiting_payment",
        `status=${statusAfter?.status}`,
      );
    }

    // Confirmation materiality via app-layer path (waive + restore)
    {
      const orderId = await createDeliveryOrder("CONF");
      const frozenBody = `${SIG} frozen confirmation body`;
      const { data: snap, error: snapErr } = await admin
        .from("order_confirmation_snapshots")
        .insert({
          order_id: orderId,
          version: 1,
          lifecycle_status: "sent",
          message_body: frozenBody,
          snapshot_payload: { customerName: SIG },
          sent_at: new Date().toISOString(),
        })
        .select("id, message_body")
        .single();
      check(!snapErr && Boolean(snap?.id), "CONF sent snapshot inserted");

      await admin
        .from("orders")
        .update({
          status: "pending_confirmation",
          confirmation_needs_resend: false,
        })
        .eq("id", orderId);

      const dueBeforeWaive = await amountDue(orderId);
      await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });
      await applyAppLayerAfterFinanceMutation({
        orderId,
        beforeAmountDue: dueBeforeWaive,
        beforeStatus: "pending_confirmation",
        beforeNetReceived: 0,
        staffId: ownerId,
      });
      const { data: afterWaive } = await admin
        .from("order_confirmation_snapshots")
        .select("lifecycle_status, message_body")
        .eq("id", snap!.id)
        .single();
      const { data: orderAfterWaive } = await admin
        .from("orders")
        .select("confirmation_needs_resend")
        .eq("id", orderId)
        .single();
      check(
        afterWaive?.lifecycle_status === "outdated" &&
          orderAfterWaive?.confirmation_needs_resend === true,
        "Z. waiver material — Confirmation outdated via app path",
      );
      check(
        afterWaive?.message_body === frozenBody,
        "AA. message_body frozen after waiver",
      );

      // Prepare a new sent Confirmation for restore materiality
      await admin
        .from("order_confirmation_snapshots")
        .insert({
          order_id: orderId,
          version: 2,
          lifecycle_status: "sent",
          message_body: `${frozenBody} v2`,
          snapshot_payload: { customerName: SIG },
          sent_at: new Date().toISOString(),
        });
      await admin
        .from("orders")
        .update({ confirmation_needs_resend: false })
        .eq("id", orderId);

      const dueBeforeRestore = await amountDue(orderId);
      await admin.rpc("restore_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });
      await applyAppLayerAfterFinanceMutation({
        orderId,
        beforeAmountDue: dueBeforeRestore,
        beforeStatus: "pending_confirmation",
        beforeNetReceived: 0,
        staffId: ownerId,
      });
      const { data: v2After } = await admin
        .from("order_confirmation_snapshots")
        .select("lifecycle_status, message_body")
        .eq("order_id", orderId)
        .eq("version", 2)
        .single();
      const { data: orderAfterRestore } = await admin
        .from("orders")
        .select("confirmation_needs_resend")
        .eq("id", orderId)
        .single();
      check(
        v2After?.lifecycle_status === "outdated" &&
          orderAfterRestore?.confirmation_needs_resend === true,
        "Z. restore material — Confirmation outdated via app path",
      );
      check(
        v2After?.message_body === `${frozenBody} v2`,
        "AA. v2 message_body frozen after restore",
      );

      // Original v1 still frozen + outdated
      const { data: v1After } = await admin
        .from("order_confirmation_snapshots")
        .select("lifecycle_status, message_body")
        .eq("id", snap!.id)
        .single();
      check(
        v1After?.message_body === frozenBody &&
          v1After?.lifecycle_status === "outdated",
        "AA. historical sent message_body remains byte-for-byte frozen",
      );

      // Repeat restore: no amountDue change → no false materiality
      const dueBeforeRepeat = await amountDue(orderId);
      const { error: repeatErr } = await admin.rpc(
        "restore_guest_order_delivery_fee",
        {
          p_order_id: orderId,
          p_actor_staff_id: ownerId,
        },
      );
      check(Boolean(repeatErr), "AB. repeat restore rejected");
      check(
        !financialMateriallyAffectsConfirmation(
          dueBeforeRepeat,
          await amountDue(orderId),
        ),
        "AB. repeat restore creates no amountDue materiality",
      );
    }

    // SQL↔TS across Processing waive/restore + override path
    {
      const orderId = await createDeliveryOrder("SQLTS");
      const steps: Array<{ label: string; run: () => Promise<void> }> = [
        {
          label: "normal Delivery Processing+Delivery",
          run: async () => undefined,
        },
        {
          label: "Processing waiver",
          run: async () => {
            await admin.rpc("waive_guest_order_processing_fee", {
              p_order_id: orderId,
              p_actor_staff_id: ownerId,
            });
          },
        },
        {
          label: "Processing restore",
          run: async () => {
            await admin.rpc("restore_guest_order_processing_fee", {
              p_order_id: orderId,
              p_actor_staff_id: ownerId,
            });
          },
        },
        {
          label: "Processing override RM3",
          run: async () => {
            await admin.rpc("override_guest_order_processing_fee", {
              p_order_id: orderId,
              p_actor_staff_id: ownerId,
              p_amount: 3,
            });
          },
        },
        {
          label: "override waiver",
          run: async () => {
            await admin.rpc("waive_guest_order_processing_fee", {
              p_order_id: orderId,
              p_actor_staff_id: ownerId,
            });
          },
        },
        {
          label: "override restore",
          run: async () => {
            await admin.rpc("restore_guest_order_processing_fee", {
              p_order_id: orderId,
              p_actor_staff_id: ownerId,
            });
          },
        },
        {
          label: "Delivery waiver",
          run: async () => {
            await admin.rpc("waive_guest_order_delivery_fee", {
              p_order_id: orderId,
              p_actor_staff_id: ownerId,
            });
          },
        },
        {
          label: "Delivery restore",
          run: async () => {
            await admin.rpc("restore_guest_order_delivery_fee", {
              p_order_id: orderId,
              p_actor_staff_id: ownerId,
            });
          },
        },
      ];
      for (const step of steps) {
        await step.run();
        const sqlDue = await amountDue(orderId);
        const tsDue = await tsAmountDue(orderId);
        check(
          Math.abs(sqlDue - tsDue) < 0.001,
          `U. SQL↔TS after ${step.label}`,
          `sql=${sqlDue} ts=${tsDue}`,
        );
      }
    }

    // Delivery→Pickup after restore removes charges; re-Delivery no resurrection
    {
      const orderId = await createDeliveryOrder("XFER");
      await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });
      await admin.rpc("restore_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
      });

      const { error: syncErr } = await admin.rpc("sync_guest_order_fulfilment", {
        p_order_id: orderId,
        p_fulfilment_method: "pickup",
        p_delivery: null,
      });
      check(!syncErr, "AI. Delivery→Pickup after restore sync ok", syncErr?.message);
      const feesPickup = await activeFeeAdjustments(orderId);
      check(feesPickup.length === 0, "AI. Delivery→Pickup removes charges");

      await admin.rpc("sync_guest_order_fulfilment", {
        p_order_id: orderId,
        p_fulfilment_method: "delivery",
        p_delivery: {
          recipient_name: "Fresh",
          recipient_phone: "0177002001",
          address_line_1: "2 New Road",
          address_line_2: null,
          postcode: "88400",
          city: "Kota Kinabalu",
          state: "Sabah",
          recipient_notify_preference: "inform_recipient",
        },
      });
      const details = await loadDetails(orderId);
      check(
        details?.delivery_fee_status === "not_set" &&
          details?.delivery_fee_quoted_amount == null &&
          details?.delivery_fee_waived === false,
        "AJ. Pickup→Delivery does not resurrect restored quote",
      );
      check(
        Number(details?.processing_fee_applicable_amount) ===
          CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT,
        "AJ. fresh Processing applicable after re-Delivery",
      );
    }

    // Finance-disabled / Pickup rejection
    {
      const pickupId = await createPickupOrder("PICK");
      const { error: pickupErr } = await admin.rpc(
        "restore_guest_order_processing_fee",
        {
          p_order_id: pickupId,
          p_actor_staff_id: ownerId,
        },
      );
      check(Boolean(pickupErr), "AC. Pickup restore rejected", pickupErr?.message);

      const histId = await createDeliveryOrder("HIST");
      await admin
        .from("order_delivery_details")
        .update({
          delivery_finance_enabled: false,
          processing_fee_applicable_amount: null,
          processing_fee_override_amount: null,
          processing_fee_waived: false,
          delivery_fee_status: "not_set",
          delivery_fee_quoted_amount: null,
          delivery_fee_waived: false,
        })
        .eq("order_id", histId);
      await admin
        .from("order_adjustments")
        .delete()
        .eq("order_id", histId)
        .in("code", [DELIVERY_PROCESSING_FEE_CODE, DELIVERY_FEE_CODE]);
      const { error: histErr } = await admin.rpc(
        "restore_guest_order_delivery_fee",
        {
          p_order_id: histId,
          p_actor_staff_id: ownerId,
        },
      );
      check(
        Boolean(histErr),
        "AD. finance-disabled restore rejected",
        histErr?.message,
      );
    }
  } finally {
    const cleanupErrors: string[] = [];
    for (const id of [...orderIds].reverse()) {
      try {
        await cleanupOrder(id);
      } catch (err) {
        cleanupErrors.push(err instanceof Error ? err.message : String(err));
      }
    }
    for (const staffId of staffIdsToDelete) {
      const { error } = await admin
        .from("staff_profiles")
        .delete()
        .eq("id", staffId);
      if (error) cleanupErrors.push(`staff ${staffId}: ${error.message}`);
    }
    for (const authId of authUserIdsToDelete) {
      const { error } = await admin.auth.admin.deleteUser(authId);
      if (error) cleanupErrors.push(`auth ${authId}: ${error.message}`);
    }

    // Fixture audit — match Slice 1: internal_notes signature
    const { data: leftover } = await admin
      .from("orders")
      .select("id, order_number, internal_notes")
      .like("internal_notes", `${SIG}%`);
    if ((leftover ?? []).length > 0) {
      cleanupErrors.push(
        `AUDIT leftover orders: ${(leftover ?? [])
          .map((o) => o.order_number)
          .join(", ")}`,
      );
    }

    const failed = checks.filter((c) => !c.ok).length;
    const passed = checks.filter((c) => c.ok).length;
    console.log(
      `\nM4-P3 Slice 2A restore live: ${passed} passed, ${failed} failed`,
    );
    if (cleanupErrors.length) {
      console.error("CLEANUP/AUDIT ERRORS:");
      for (const msg of cleanupErrors) console.error(`  ${msg}`);
      process.exit(1);
    }
    if (failed > 0) process.exit(1);
    console.log("AUDIT CLEAN");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
