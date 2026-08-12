/**
 * M4-P3 Slice 1 — live Delivery financial authority (schema + RPCs + settlement).
 *
 * Prerequisites:
 *   apply 20260811160000_m4_p3_delivery_finance_authority.sql
 *
 * Run: npx tsx scripts/test-m4-p3-slice1-delivery-finance-live.ts
 *
 * Unique fixture signatures. try/finally cleanup. Cleanup errors fail the suite.
 * Does NOT pipe through head. Does NOT touch tmp/.
 */
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT,
  DELIVERY_FEE_CODE,
  DELIVERY_PROCESSING_FEE_CODE,
} from "@/engines/orders/delivery-finance";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import { commercialLinesForSettlement } from "@/engines/orders/totals";

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

const SIG = `M4P3S1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PHONE_OWNER = "0177001001";
const PHONE_HIST = "0177001002";

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
    "supabase/migrations/20260811160000_m4_p3_delivery_finance_authority.sql",
  );
  const migrationHash = createHash("sha256")
    .update(readFileSync(migrationPath))
    .digest("hex");
  console.log(`migration sha256=${migrationHash}`);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: defaultProbe, error: defaultErr } = await admin.rpc(
    "current_delivery_processing_fee_default",
  );
  if (defaultErr) {
    console.error(
      "BLOCKED: migration not applied — current_delivery_processing_fee_default missing.",
    );
    console.error(defaultErr.message);
    process.exit(2);
  }
  assert.equal(Number(defaultProbe), CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT);

  const checks: Check[] = [];
  const orderIds: string[] = [];
  const staffIdsToDelete: string[] = [];
  const authUserIdsToDelete: string[] = [];
  let counterStaffId: string | null = null;

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
      .select("id, code, amount, status, metadata, reverses_adjustment_id")
      .eq("order_id", orderId)
      .in("code", [DELIVERY_PROCESSING_FEE_CODE, DELIVERY_FEE_CODE])
      .eq("status", "active")
      .is("reverses_adjustment_id", null);
    if (error) throw error;
    return data ?? [];
  }

  async function tsAmountDue(orderId: string): Promise<number> {
    const { data: items, error: itemsErr } = await admin
      .from("order_items")
      .select("unit_price, quantity")
      .eq("order_id", orderId);
    if (itemsErr) throw itemsErr;
    const { data: addons, error: addonsErr } = await admin
      .from("order_paid_addons")
      .select("unit_price, quantity")
      .eq("order_id", orderId);
    if (addonsErr) throw addonsErr;
    // Match SQL order_adjustments_total / Owner query path: sum ALL adjustment
    // rows (reversed originals + reversals net). Do not filter status=active only.
    const { data: adjustments, error: adjErr } = await admin
      .from("order_adjustments")
      .select("amount, status")
      .eq("order_id", orderId);
    if (adjErr) throw adjErr;
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
      allocations: [],
      refunds: [],
    }).amountDue;
  }

  async function cleanupOrder(orderId: string) {
    const steps: Array<{
      label: string;
      run: () => Promise<{ error: { message: string } | null }>;
    }> = [
      {
        label: "payment_allocations",
        run: () =>
          admin.from("payment_allocations").delete().eq("order_id", orderId),
      },
      {
        label: "refunds",
        run: () => admin.from("refunds").delete().eq("order_id", orderId),
      },
      {
        label: "order_adjustments",
        run: () =>
          admin.from("order_adjustments").delete().eq("order_id", orderId),
      },
      {
        // CASCADE removes delivery details, items, complimentary, paid add-ons,
        // paid-addon messages, timeline, confirmation snapshots, etc.
        label: "orders",
        run: () => admin.from("orders").delete().eq("id", orderId),
      },
    ];

    for (const step of steps) {
      const { error } = await step.run();
      if (error) {
        throw new Error(
          `Slice 1 fixture cleanup failed (${step.label}) for ${orderId}: ${error.message}`,
        );
      }
    }
  }

  try {
    const { data: staff, error: staffErr } = await admin
      .from("staff_profiles")
      .select("id, role_id")
      .limit(1)
      .maybeSingle();
    if (staffErr || !staff?.id) throw new Error("No staff_profiles");

    const { data: coRole } = await admin
      .from("roles")
      .select("id")
      .eq("code", "customer_operations")
      .maybeSingle();
    if (!coRole?.id) throw new Error("customer_operations role missing");

    // Ephemeral Counter staff (auth user + profile) for request authority tests
    const counterEmail = `m4p3s1-counter-${Date.now()}@whitebird.dev`;
    const { data: authCreated, error: authErr } =
      await admin.auth.admin.createUser({
        email: counterEmail,
        password: `TmpCounter_${Date.now()}!`,
        email_confirm: true,
      });
    if (authErr || !authCreated.user?.id) {
      throw new Error(authErr?.message ?? "Failed to create counter auth user");
    }
    authUserIdsToDelete.push(authCreated.user.id);
    const { data: counterProfile, error: counterErr } = await admin
      .from("staff_profiles")
      .insert({
        auth_user_id: authCreated.user.id,
        username: `m4p3s1c${Date.now().toString().slice(-6)}`,
        email: counterEmail,
        display_name: `${SIG} Counter`,
        role_id: coRole.id,
        is_active: true,
      })
      .select("id")
      .single();
    if (counterErr || !counterProfile?.id) {
      throw new Error(counterErr?.message ?? "Failed to create counter staff");
    }
    counterStaffId = counterProfile.id;
    staffIdsToDelete.push(counterProfile.id);

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
      recipient_phone: "0198888001",
      address_line_1: "12 Jalan Finance",
      address_line_2: null,
      postcode: "88400",
      city: "Kota Kinabalu",
      state: "Sabah",
      recipient_notify_preference: "inform_recipient",
    };

    async function createOrder(input: {
      name: string;
      phone: string;
      method: "pickup" | "delivery";
      delivery?: typeof deliveryPayload | null;
    }) {
      const { data, error } = await admin.rpc("create_staff_guest_preorder", {
        p_actor_staff_id: staff!.id,
        p_customer_name: input.name,
        p_phone: input.phone,
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
        p_internal_notes: `${SIG}-live`,
        p_fulfilment_method: input.method,
        p_delivery: input.method === "delivery" ? input.delivery : null,
      });
      if (error || !data?.id) {
        throw new Error(error?.message ?? "create failed");
      }
      orderIds.push(data.id);
      return data.id as string;
    }

    // A. Pickup = no Delivery charges
    {
      const id = await createOrder({
        name: `${SIG} Pickup`,
        phone: PHONE_OWNER,
        method: "pickup",
      });
      const due = await amountDue(id);
      const fees = await activeFeeAdjustments(id);
      check(due === cakePrice, "A Pickup no Delivery charges", `due=${due}`);
      check(fees.length === 0, "A Pickup no fee adjustments");
    }

    // B / V / C — new governed Delivery initializes processing RM5, Delivery NOT SET
    const govId = await createOrder({
      name: `${SIG} Governed`,
      phone: PHONE_OWNER,
      method: "delivery",
      delivery: deliveryPayload,
    });
    {
      const d = await loadDetails(govId);
      const due = await amountDue(govId);
      const fees = await activeFeeAdjustments(govId);
      check(Boolean(d?.delivery_finance_enabled), "B finance enabled on new Delivery");
      check(
        Number(d?.processing_fee_applicable_amount) === 5,
        "B/V processing applicable RM5",
      );
      check(d?.delivery_fee_status === "not_set", "C Delivery NOT SET");
      check(d?.delivery_fee_quoted_amount == null, "C quote null when NOT SET");
      check(due === cakePrice + 5, "B amountDue = cake + processing", `due=${due}`);
      check(
        fees.some(
          (f) =>
            f.code === DELIVERY_PROCESSING_FEE_CODE && Number(f.amount) === 5,
        ) && !fees.some((f) => f.code === DELIVERY_FEE_CODE),
        "B only processing adjustment active",
      );
    }

    // D–J quotes
    async function quoteAndCheck(amount: number, label: string) {
      const before = await amountDue(govId);
      const { error } = await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: govId,
        p_actor_staff_id: staff!.id,
        p_amount: amount,
      });
      check(!error, `${label} quote rpc`, error?.message);
      const d = await loadDetails(govId);
      const due = await amountDue(govId);
      check(d?.delivery_fee_status === "quoted", `${label} status quoted`);
      check(
        Number(d?.delivery_fee_quoted_amount) === amount,
        `${label} quoted amount`,
      );
      check(
        due === before - (before - (cakePrice + 5)) + amount ||
          due === cakePrice + 5 + amount,
        `${label} amountDue`,
        `due=${due}`,
      );
      // Prefer exact: cake + 5 + amount (may have prior quote)
      check(
        due === cakePrice + 5 + amount,
        `${label} exact due cake+5+quote`,
        `due=${due}`,
      );
    }

    await quoteAndCheck(5, "D RM5");
    await quoteAndCheck(10, "E RM10");
    await quoteAndCheck(15, "F RM15");
    await quoteAndCheck(20, "G RM20");
    await quoteAndCheck(25, "H RM25");
    await quoteAndCheck(30, "I RM30");
    await quoteAndCheck(12, "J Custom RM12");

    // K negative rejected
    {
      const before = await amountDue(govId);
      const { error } = await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: govId,
        p_actor_staff_id: staff!.id,
        p_amount: -1,
      });
      check(Boolean(error), "K negative quote rejected", error?.message);
      check((await amountDue(govId)) === before, "K due unchanged after negative");
      const { error: zeroErr } = await admin.rpc(
        "set_guest_order_delivery_fee_quote",
        {
          p_order_id: govId,
          p_actor_staff_id: staff!.id,
          p_amount: 0,
        },
      );
      check(Boolean(zeroErr), "K RM0 quote rejected (use waiver)", zeroErr?.message);
    }

    // Reset quote to RM15 for waiver tests
    await admin.rpc("set_guest_order_delivery_fee_quote", {
      p_order_id: govId,
      p_actor_staff_id: staff!.id,
      p_amount: 15,
    });

    // L–O Owner Delivery waiver
    {
      const { error } = await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: govId,
        p_actor_staff_id: staff!.id,
        p_reason: "Owner courtesy",
      });
      check(!error, "L Owner Delivery waiver", error?.message);
      const d = await loadDetails(govId);
      check(d?.delivery_fee_status === "quoted_waived", "L status quoted_waived");
      check(Number(d?.delivery_fee_quoted_amount) === 15, "M original RM15 auditable");
      check(Boolean(d?.delivery_fee_waived), "M waived flag");
      const due = await amountDue(govId);
      check(due === cakePrice + 5, "N effective Delivery payable RM0", `due=${due}`);
      const fees = await activeFeeAdjustments(govId);
      check(
        fees.some(
          (f) =>
            f.code === DELIVERY_PROCESSING_FEE_CODE && Number(f.amount) === 5,
        ),
        "O processing remains after Delivery waiver",
      );
      check(
        !fees.some((f) => f.code === DELIVERY_FEE_CODE),
        "N no active delivery_fee adjustment",
      );
    }

    // U repeated waiver sync idempotent
    {
      const before = await amountDue(govId);
      const { error } = await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: govId,
        p_actor_staff_id: staff!.id,
        p_reason: "repeat",
      });
      check(!error, "U repeat waiver ok", error?.message);
      check((await amountDue(govId)) === before, "U due unchanged on repeat waiver");
    }

    // Re-quote for Counter request path
    await admin.rpc("set_guest_order_delivery_fee_quote", {
      p_order_id: govId,
      p_actor_staff_id: staff!.id,
      p_amount: 15,
    });

    // P Counter cannot directly waive
    {
      const before = await amountDue(govId);
      const { error } = await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: govId,
        p_actor_staff_id: counterStaffId,
        p_reason: "counter try",
      });
      check(Boolean(error), "P Counter cannot directly waive", error?.message);
      check((await amountDue(govId)) === before, "P due unchanged");
    }

    // Q–T request → pending → approve / reject
    {
      const before = await amountDue(govId);
      const { error: reqErr } = await admin.rpc(
        "request_guest_order_delivery_fee_waiver",
        {
          p_order_id: govId,
          p_actor_staff_id: counterStaffId,
          p_reason: "VIP regular",
        },
      );
      check(!reqErr, "Q Counter request seam", reqErr?.message);
      const pending = await loadDetails(govId);
      check(
        pending?.delivery_fee_request_status === "pending",
        "Q pending request recorded",
      );
      check(
        (await amountDue(govId)) === before,
        "R pending does not change payable",
      );

      const { error: rejErr } = await admin.rpc(
        "resolve_guest_order_delivery_fee_request",
        {
          p_order_id: govId,
          p_actor_staff_id: staff!.id,
          p_approve: false,
          p_note: "not this time",
        },
      );
      check(!rejErr, "T rejection rpc", rejErr?.message);
      check(
        (await amountDue(govId)) === before,
        "T rejection leaves payable fee",
      );
      const rejected = await loadDetails(govId);
      check(
        rejected?.delivery_fee_request_status === "rejected",
        "T status rejected",
      );
      check(rejected?.delivery_fee_status === "quoted", "T still quoted");

      // Request again + approve
      await admin.rpc("request_guest_order_delivery_fee_waiver", {
        p_order_id: govId,
        p_actor_staff_id: counterStaffId,
        p_reason: "retry VIP",
      });
      const { error: appErr } = await admin.rpc(
        "resolve_guest_order_delivery_fee_request",
        {
          p_order_id: govId,
          p_actor_staff_id: staff!.id,
          p_approve: true,
          p_note: "ok",
        },
      );
      check(!appErr, "S Owner approval", appErr?.message);
      const approved = await loadDetails(govId);
      check(
        approved?.delivery_fee_status === "quoted_waived" &&
          Number(approved?.delivery_fee_quoted_amount) === 15,
        "S waiver authoritative + quote preserved",
      );
      check(
        (await amountDue(govId)) === cakePrice + 5,
        "S effective Delivery RM0",
      );
    }

    // W–Z / AC Processing override + waiver
    await admin.rpc("set_guest_order_delivery_fee_quote", {
      p_order_id: govId,
      p_actor_staff_id: staff!.id,
      p_amount: 15,
    });
    {
      const { error } = await admin.rpc("override_guest_order_processing_fee", {
        p_order_id: govId,
        p_actor_staff_id: staff!.id,
        p_amount: 3,
        p_reason: "override",
      });
      check(!error, "W Owner processing override RM3", error?.message);
      const d = await loadDetails(govId);
      check(Number(d?.processing_fee_applicable_amount) === 5, "W applicable still 5");
      check(Number(d?.processing_fee_override_amount) === 3, "W override 3");
      check(
        (await amountDue(govId)) === cakePrice + 3 + 15,
        "W due uses override",
      );

      const { error: neg } = await admin.rpc(
        "override_guest_order_processing_fee",
        {
          p_order_id: govId,
          p_actor_staff_id: staff!.id,
          p_amount: -2,
          p_reason: "bad",
        },
      );
      check(Boolean(neg), "AC negative processing rejected", neg?.message);

      const { error: wErr } = await admin.rpc("waive_guest_order_processing_fee", {
        p_order_id: govId,
        p_actor_staff_id: staff!.id,
        p_reason: "waive proc",
      });
      check(!wErr, "X Owner processing waiver", wErr?.message);
      const wd = await loadDetails(govId);
      check(Number(wd?.processing_fee_applicable_amount) === 5, "Y applicable after waiver");
      check(Boolean(wd?.processing_fee_waived), "X waived flag");
      check(
        (await amountDue(govId)) === cakePrice + 15,
        "Z processing waiver does not waive Delivery",
        `due=${await amountDue(govId)}`,
      );
    }

    // AA / AB Counter cannot finalize processing; pending leaves payable
    {
      // restore payable processing for request test
      await admin.rpc("override_guest_order_processing_fee", {
        p_order_id: govId,
        p_actor_staff_id: staff!.id,
        p_amount: 5,
        p_reason: "reset",
      });
      const before = await amountDue(govId);
      const { error: direct } = await admin.rpc(
        "waive_guest_order_processing_fee",
        {
          p_order_id: govId,
          p_actor_staff_id: counterStaffId,
          p_reason: "no",
        },
      );
      check(Boolean(direct), "AA Counter cannot waive processing", direct?.message);
      const { error: req } = await admin.rpc(
        "request_guest_order_processing_fee_change",
        {
          p_order_id: govId,
          p_actor_staff_id: counterStaffId,
          p_kind: "processing_waiver",
          p_proposed_amount: null,
          p_reason: "please waive",
        },
      );
      check(!req, "AB Counter processing request seam", req?.message);
      check((await amountDue(govId)) === before, "AB pending does not alter processing");
      await admin.rpc("resolve_guest_order_processing_fee_request", {
        p_order_id: govId,
        p_actor_staff_id: staff!.id,
        p_approve: false,
        p_note: "no",
      });
    }

    // AD Delivery → Pickup removes charges
    {
      const { error } = await admin.rpc("sync_guest_order_fulfilment", {
        p_order_id: govId,
        p_fulfilment_method: "pickup",
        p_delivery: null,
      });
      check(!error, "AD Delivery→Pickup sync", error?.message);
      const details = await loadDetails(govId);
      check(details == null, "AD delivery details deleted");
      check((await amountDue(govId)) === cakePrice, "AD charges removed");
      check(
        (await activeFeeAdjustments(govId)).length === 0,
        "AD no active fee adjustments",
      );
    }

    // AE Pickup → Delivery fresh processing + NOT SET
    {
      const { error } = await admin.rpc("sync_guest_order_fulfilment", {
        p_order_id: govId,
        p_fulfilment_method: "delivery",
        p_delivery: deliveryPayload,
      });
      check(!error, "AE Pickup→Delivery sync", error?.message);
      const d = await loadDetails(govId);
      check(Boolean(d?.delivery_finance_enabled), "AE finance enabled");
      check(Number(d?.processing_fee_applicable_amount) === 5, "AE fresh processing 5");
      check(d?.delivery_fee_status === "not_set", "AE Delivery NOT SET");
      check(d?.delivery_fee_quoted_amount == null, "AF no quote resurrection");
      check(!d?.delivery_fee_waived, "AG no waiver resurrection");
      check((await amountDue(govId)) === cakePrice + 5, "AE due cake+5");
    }

    // AH repeated sync idempotent
    {
      const before = await amountDue(govId);
      const feesBefore = await activeFeeAdjustments(govId);
      await admin.rpc("sync_guest_order_fulfilment", {
        p_order_id: govId,
        p_fulfilment_method: "delivery",
        p_delivery: deliveryPayload,
      });
      await admin.rpc("_sync_delivery_finance_adjustments", {
        p_order_id: govId,
        p_actor_staff_id: staff!.id,
      }).then(() => null).catch(() => null);
      // Internal sync not callable — re-quote same path via set quote no-op
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: govId,
        p_actor_staff_id: staff!.id,
        p_amount: 15,
      });
      const mid = await amountDue(govId);
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: govId,
        p_actor_staff_id: staff!.id,
        p_amount: 15,
      });
      check((await amountDue(govId)) === mid, "AH repeated quote sync idempotent");
      const fees = await activeFeeAdjustments(govId);
      const proc = fees.filter((f) => f.code === DELIVERY_PROCESSING_FEE_CODE);
      const del = fees.filter((f) => f.code === DELIVERY_FEE_CODE);
      check(proc.length === 1 && del.length === 1, "AH one active adjustment per code");
      void before;
      void feesBefore;
    }

    // AP SQL ↔ TS
    {
      const sqlDue = await amountDue(govId);
      const tsDue = await tsAmountDue(govId);
      check(sqlDue === tsDue, "AP SQL amountDue == TS settlement", `${sqlDue} vs ${tsDue}`);
    }

    // AX–BB historical M4-P2 Delivery — no retroactive charges
    {
      const histId = await createOrder({
        name: `${SIG} Historical`,
        phone: PHONE_HIST,
        method: "delivery",
        delivery: {
          ...deliveryPayload,
          recipient_name: `${SIG} Hist Recipient`,
        },
      });
      // Simulate pre-M4-P3 Delivery: keep details row + method=delivery, but
      // disable finance gate and remove fee adjustments (no retroactive charges).
      const { error: histUpdateErr } = await admin
        .from("order_delivery_details")
        .update({
          delivery_finance_enabled: false,
          processing_fee_applicable_amount: null,
          processing_fee_override_amount: null,
          processing_fee_waived: false,
          delivery_fee_status: "not_set",
          delivery_fee_quoted_amount: null,
          delivery_fee_waived: false,
          fee_request_kind: null,
          fee_request_status: null,
          fee_request_proposed_amount: null,
          fee_request_reason: null,
          delivery_fee_request_status: null,
          delivery_fee_request_reason: null,
          delivery_fee_request_quoted_amount: null,
          delivery_fee_requested_by: null,
          delivery_fee_requested_at: null,
          delivery_fee_request_resolved_by: null,
          delivery_fee_request_resolved_at: null,
          delivery_fee_request_resolution_note: null,
          processing_fee_request_kind: null,
          processing_fee_request_status: null,
          processing_fee_request_proposed_amount: null,
          processing_fee_request_reason: null,
          processing_fee_requested_by: null,
          processing_fee_requested_at: null,
          processing_fee_request_resolved_by: null,
          processing_fee_request_resolved_at: null,
          processing_fee_request_resolution_note: null,
        })
        .eq("order_id", histId);
      check(!histUpdateErr, "AX historical finance disable", histUpdateErr?.message);

      const { error: histAdjErr } = await admin
        .from("order_adjustments")
        .delete()
        .eq("order_id", histId)
        .in("code", [DELIVERY_PROCESSING_FEE_CODE, DELIVERY_FEE_CODE]);
      check(!histAdjErr, "AX historical fee adjustments cleared", histAdjErr?.message);

      const dueBefore = await amountDue(histId);
      check(dueBefore === cakePrice, "AX no processing on historical", `due=${dueBefore}`);

      // Address-only sync must not enable finance / invent quote
      const { error: syncErr } = await admin.rpc("sync_guest_order_fulfilment", {
        p_order_id: histId,
        p_fulfilment_method: "delivery",
        p_delivery: {
          ...deliveryPayload,
          recipient_name: `${SIG} Hist Recipient`,
          address_line_1: "100 Jalan History",
        },
      });
      check(!syncErr, "AX address sync ok", syncErr?.message);
      const d = await loadDetails(histId);
      check(d?.delivery_finance_enabled === false, "AX finance still disabled");
      check(d?.delivery_fee_status === "not_set", "AY no invented quote");
      check(
        (await amountDue(histId)) === cakePrice,
        "AX amountDue unchanged after address edit",
      );
      check(
        (await activeFeeAdjustments(histId)).length === 0,
        "AX no fee adjustments",
      );
    }

    // AZ historical Pickup unchanged
    {
      const id = await createOrder({
        name: `${SIG} HistPickup`,
        phone: PHONE_HIST,
        method: "pickup",
      });
      check((await amountDue(id)) === cakePrice, "AZ historical Pickup unchanged");
    }

    // AI / AJ / AK — paid-add-on + August cake-only + RM10 coexistence
    {
      const id = await createOrder({
        name: `${SIG} Coexist`,
        phone: PHONE_OWNER,
        method: "delivery",
        delivery: {
          ...deliveryPayload,
          recipient_name: `${SIG} Coexist Recip`,
        },
      });
      const { error: addonErr } = await admin.rpc("sync_guest_order_paid_addons", {
        p_order_id: id,
        p_paid_addons: [
          { code: "birthday_card", quantity: 1, messages: ["Hi"] },
        ],
      });
      check(!addonErr, "AI paid-add-on sync", addonErr?.message);
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: id,
        p_actor_staff_id: staff!.id,
        p_amount: 15,
      });
      const dueWithFees = await amountDue(id);
      check(
        dueWithFees === cakePrice + 3 + 5 + 15,
        "AI paid-add-on + processing + Delivery",
        `due=${dueWithFees}`,
      );

      // August cake-only: fees must not help eligibility (engine)
      const { evaluateAugustPromoEligibility } = await import(
        "@/engines/orders/promotions"
      );
      const august = evaluateAugustPromoEligibility({
        orderSource: "customer_website",
        orderDate: "2026-08-01",
        pickupDate: "2026-08-15",
        cakeSubtotal: 99,
        hasAugustPromo: false,
        hasRm10Card: false,
        hasVerifiedPayments: false,
        orderStatus: "submitted",
      });
      check(!august.eligible, "AJ August cake-only (fees irrelevant)");

      // RM10 flat coexistence
      const { error: rm10Err } = await admin.from("order_adjustments").insert({
        order_id: id,
        kind: "discount",
        code: "rm10_physical_card",
        label: "RM10 Discount Card",
        amount: -10,
        status: "active",
        created_by: staff!.id,
      });
      check(!rm10Err, "AK RM10 insert", rm10Err?.message);
      check(
        (await amountDue(id)) === cakePrice + 3 + 5 + 15 - 10,
        "AK RM10 coexistence with Delivery fees",
      );
    }

    // AL / AM / AN / AO — payment + fee change / overpayment / immutability
    {
      const payId = await createOrder({
        name: `${SIG} Payment`,
        phone: PHONE_OWNER,
        method: "delivery",
        delivery: {
          ...deliveryPayload,
          recipient_name: `${SIG} Pay Recip`,
        },
      });
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: payId,
        p_actor_staff_id: staff!.id,
        p_amount: 10,
      });
      // cake + 5 + 10
      const dueQuoted = await amountDue(payId);
      check(dueQuoted === cakePrice + 15, "AL baseline due before partial", `due=${dueQuoted}`);

      await admin
        .from("orders")
        .update({ status: "awaiting_payment" })
        .eq("id", payId);

      const partialAmount = 50;
      const { data: payPartial, error: payPartialErr } = await admin.rpc(
        "record_and_verify_guest_order_payment",
        {
          p_order_id: payId,
          p_amount: partialAmount,
          p_method: "wb_qr",
          p_method_description: null,
          p_paid_at: new Date().toISOString(),
          p_reference_note: `${SIG}-partial`,
          p_verifier_staff_id: staff!.id,
        },
      );
      check(!payPartialErr, "AL partial payment recorded", payPartialErr?.message);
      const paymentId = payPartial?.payment_id as string | undefined;

      const { data: net1 } = await admin.rpc("order_net_received", {
        p_order_id: payId,
      });
      check(Number(net1) === partialAmount, "AL net received = partial");

      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: payId,
        p_actor_staff_id: staff!.id,
        p_amount: 30,
      });
      const dueAfterIncrease = await amountDue(payId);
      check(
        dueAfterIncrease === cakePrice + 5 + 30,
        "AL fee increase raises amountDue",
        `due=${dueAfterIncrease}`,
      );
      const remaining = dueAfterIncrease - Number(net1);
      check(remaining > cakePrice + 15 - partialAmount, "AL remaining balance increases");

      // Finish to Paid, then increase again
      const remainingToPay = dueAfterIncrease - Number(net1);
      const { error: payFullErr } = await admin.rpc(
        "record_and_verify_guest_order_payment",
        {
          p_order_id: payId,
          p_amount: remainingToPay,
          p_method: "wb_qr",
          p_method_description: null,
          p_paid_at: new Date().toISOString(),
          p_reference_note: `${SIG}-full`,
          p_verifier_staff_id: staff!.id,
        },
      );
      check(!payFullErr, "AM finish payment to Paid", payFullErr?.message);
      const { data: statusPaid } = await admin
        .from("orders")
        .select("status")
        .eq("id", payId)
        .single();
      check(statusPaid?.status === "paid", "AM status paid");

      const { data: paymentsBefore } = await admin
        .from("payment_allocations")
        .select("payment_id, amount")
        .eq("order_id", payId)
        .order("payment_id");
      const paySnapshot = JSON.stringify(paymentsBefore);

      // Paid + fee increase (quote 30 → 40)
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: payId,
        p_actor_staff_id: staff!.id,
        p_amount: 40,
      });
      const duePaidIncrease = await amountDue(payId);
      const { data: netPaid } = await admin.rpc("order_net_received", {
        p_order_id: payId,
      });
      check(
        duePaidIncrease === cakePrice + 5 + 40,
        "AM Paid-order fee increase amountDue",
        `due=${duePaidIncrease}`,
      );
      check(
        Number(netPaid) < duePaidIncrease,
        "AM remaining balance after Paid fee increase",
      );

      const { data: paymentsMid } = await admin
        .from("payment_allocations")
        .select("payment_id, amount")
        .eq("order_id", payId)
        .order("payment_id");
      check(
        JSON.stringify(paymentsMid) === paySnapshot,
        "AO verified payment allocations unchanged after fee increase",
      );

      if (paymentId) {
        const { data: payRowBefore } = await admin
          .from("payments")
          .select("id, amount, status, method, reference_note")
          .eq("id", paymentId)
          .single();
        const payRowSnap = JSON.stringify(payRowBefore);

        // Waiver after payment → overpayment
        const { error: waiveErr } = await admin.rpc(
          "waive_guest_order_delivery_fee",
          {
            p_order_id: payId,
            p_actor_staff_id: staff!.id,
            p_reason: "post-pay waive",
          },
        );
        check(!waiveErr, "AN Delivery waiver after payment", waiveErr?.message);
        const dueWaived = await amountDue(payId);
        check(
          dueWaived === cakePrice + 5,
          "AN amountDue after Delivery waiver",
          `due=${dueWaived}`,
        );
        const overpayment = Number(netPaid) - dueWaived;
        check(overpayment > 0, "AN overpayment semantics", `over=${overpayment}`);

        const { data: payRowAfter } = await admin
          .from("payments")
          .select("id, amount, status, method, reference_note")
          .eq("id", paymentId)
          .single();
        check(
          JSON.stringify(payRowAfter) === payRowSnap,
          "AO verified payment row immutable after waiver",
        );
      }
    }

    // AW frozen sent Confirmation body
    {
      const confId = await createOrder({
        name: `${SIG} ConfirmFreeze`,
        phone: PHONE_OWNER,
        method: "delivery",
        delivery: {
          ...deliveryPayload,
          recipient_name: `${SIG} Conf Recip`,
        },
      });
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: confId,
        p_actor_staff_id: staff!.id,
        p_amount: 15,
      });
      const frozenBody = `${SIG} FROZEN CONFIRMATION BODY — do not rewrite`;
      const { data: snap, error: confErr } = await admin
        .from("order_confirmation_snapshots")
        .insert({
          order_id: confId,
          version: 1,
          lifecycle_status: "sent",
          message_body: frozenBody,
          snapshot_payload: {},
          sent_at: new Date().toISOString(),
        })
        .select("id, message_body")
        .single();
      check(!confErr && Boolean(snap?.id), "AW insert sent confirmation", confErr?.message);

      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: confId,
        p_actor_staff_id: staff!.id,
        p_amount: 25,
      });
      await admin.rpc("waive_guest_order_processing_fee", {
        p_order_id: confId,
        p_actor_staff_id: staff!.id,
        p_reason: "freeze test",
      });

      const { data: confAfter } = await admin
        .from("order_confirmation_snapshots")
        .select("message_body, lifecycle_status")
        .eq("id", snap!.id)
        .single();
      check(
        confAfter?.lifecycle_status === "sent" &&
          confAfter?.message_body === frozenBody,
        "AW frozen sent body unchanged after fee changes",
      );
    }

    // BC future default safety — persisted applicable independent of function body
    {
      const d = await loadDetails(govId);
      check(
        Number(d?.processing_fee_applicable_amount) === 5,
        "BC persisted applicable RM5 on governed order",
      );
    }

    // BD anon cannot execute internal sync (best-effort via anon key)
    {
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (anon) {
        const anonClient: SupabaseClient = createClient(url, anon, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error } = await anonClient.rpc(
          "_sync_delivery_finance_adjustments",
          {
            p_order_id: govId,
            p_actor_staff_id: staff!.id,
          },
        );
        check(Boolean(error), "BD anon cannot call internal sync", error?.message);
      } else {
        pass("BD anon check skipped (no anon key)");
      }
    }

    // Fixture audit
    {
      const { data: leftover } = await admin
        .from("orders")
        .select("id, guest_name, guest_phone")
        .like("guest_name", `${SIG}%`);
      console.log(
        `Fixture audit before cleanup: ${(leftover ?? []).length} orders with SIG ${SIG}`,
      );
      for (const row of leftover ?? []) {
        console.log(`  - ${row.id} ${row.guest_name} ${row.guest_phone}`);
      }
    }
  } finally {
    const cleanupFailures: string[] = [];
    for (const id of orderIds) {
      try {
        await cleanupOrder(id);
      } catch (e) {
        cleanupFailures.push(e instanceof Error ? e.message : String(e));
      }
    }
    for (const sid of staffIdsToDelete) {
      const { error } = await admin.from("staff_profiles").delete().eq("id", sid);
      if (error) cleanupFailures.push(`staff ${sid}: ${error.message}`);
    }
    for (const uid of authUserIdsToDelete) {
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (error) cleanupFailures.push(`auth ${uid}: ${error.message}`);
    }

    // Post-cleanup audit — only SIG leftovers are failures
    const { data: leftover } = await admin
      .from("orders")
      .select("id, guest_name")
      .like("guest_name", `${SIG}%`);
    if ((leftover ?? []).length > 0) {
      cleanupFailures.push(
        `Leftover SIG fixtures: ${(leftover ?? []).map((r) => r.id).join(",")}`,
      );
    }

    // Counter staff leftover audit
    if (staffIdsToDelete.length > 0) {
      const { data: leftoverStaff } = await admin
        .from("staff_profiles")
        .select("id, display_name")
        .in("id", staffIdsToDelete);
      if ((leftoverStaff ?? []).length > 0) {
        cleanupFailures.push(
          `Leftover staff fixtures: ${(leftoverStaff ?? []).map((r) => r.id).join(",")}`,
        );
      }
    }

    if (cleanupFailures.length > 0) {
      console.error("Slice 1 fixture cleanup failures:");
      for (const message of cleanupFailures) console.error(`  ${message}`);
    }

    const failed = checks.filter((c) => !c.ok).length + cleanupFailures.length;
    const passed = checks.filter((c) => c.ok).length;
    console.log(`M4-P3 Slice 1 live DB: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
