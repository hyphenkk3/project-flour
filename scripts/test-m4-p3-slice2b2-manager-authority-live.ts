/**
 * M4-P3 Slice 2B-2 — live Manager Delivery Charges authority + resolve matrix.
 *
 * Prerequisites:
 *   apply 20260812080000_m4_p3_manager_delivery_charges_authority.sql
 *   Expected SHA-256:
 *   f25ce8644eec5dcd98e20a845d776cb578b76d903dafcfc206141bc0038c4088
 *
 * Run: npx tsx scripts/test-m4-p3-slice2b2-manager-authority-live.ts
 *
 * Dedicated fixtures only. Never mutates Product manual-test order.
 * Exit 2 if migration not applied.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const SIG = `M4P3S2B2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EXPECTED_HASH =
  "f25ce8644eec5dcd98e20a845d776cb578b76d903dafcfc206141bc0038c4088";
const PRODUCT_MANUAL_ORDER_ID = "7e9779ac-152b-42e0-8002-34ba8e9b11b5";

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
    "supabase/migrations/20260812080000_m4_p3_manager_delivery_charges_authority.sql",
  );
  const migrationHash = createHash("sha256")
    .update(readFileSync(migrationPath))
    .digest("hex");
  console.log(`2B-2 migration sha256=${migrationHash}`);
  assert.equal(migrationHash, EXPECTED_HASH);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const probe = await admin.rpc("waive_guest_order_delivery_fee", {
    p_order_id: "00000000-0000-0000-0000-000000000000",
    p_actor_staff_id: "00000000-0000-0000-0000-000000000000",
    p_reason: null,
  });
  const probeMsg = probe.error?.message ?? "";
  if (/Could not find the function|schema cache|does not exist/i.test(probeMsg)) {
    console.error("BLOCKED: 2B-2 waive RPC missing.");
    console.error(probeMsg);
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

  async function tsSettlement(orderId: string) {
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
    const { data: adjustments, error: adjErr } = await admin
      .from("order_adjustments")
      .select("amount")
      .eq("order_id", orderId);
    if (adjErr) throw adjErr;
    const { data: allocations, error: allocErr } = await admin
      .from("payment_allocations")
      .select("amount, payment_id")
      .eq("order_id", orderId);
    if (allocErr) throw allocErr;
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
    const { data: refunds, error: refundErr } = await admin
      .from("refunds")
      .select("amount, status")
      .eq("order_id", orderId);
    if (refundErr) throw refundErr;
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
            : ("verified" as const),
      })),
      refunds: (refunds ?? []).map((r) => ({
        amount: Number(r.amount),
        status: "recorded" as const,
      })),
    });
  }

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
          payment_status: reconciled.newStatus === "paid" ? "paid" : "unpaid",
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

  async function cleanupOrder(orderId: string) {
    if (orderId === PRODUCT_MANUAL_ORDER_ID) {
      throw new Error("Refusing to cleanup Product manual-test order");
    }
    const steps = [
      () => admin.from("payment_allocations").delete().eq("order_id", orderId),
      () => admin.from("refunds").delete().eq("order_id", orderId),
      () => admin.from("order_adjustments").delete().eq("order_id", orderId),
      () => admin.from("orders").delete().eq("id", orderId),
    ];
    for (const run of steps) {
      const { error } = await run();
      if (error) {
        throw new Error(`2B-2 cleanup failed for ${orderId}: ${error.message}`);
      }
    }
  }

  async function createEphemeralStaff(roleCode: string, label: string) {
    const { data: role } = await admin
      .from("roles")
      .select("id")
      .eq("code", roleCode)
      .maybeSingle();
    if (!role?.id) throw new Error(`${roleCode} role missing`);
    const email = `m4p3s2b2-${label}-${Date.now()}@whitebird.dev`;
    const { data: authCreated, error: authErr } =
      await admin.auth.admin.createUser({
        email,
        password: `Tmp2B2_${Date.now()}!`,
        email_confirm: true,
      });
    if (authErr || !authCreated.user?.id) {
      throw new Error(authErr?.message ?? `Failed auth ${label}`);
    }
    authUserIdsToDelete.push(authCreated.user.id);
    const { data: profile, error: profileErr } = await admin
      .from("staff_profiles")
      .insert({
        auth_user_id: authCreated.user.id,
        username: `s2b2${label}${Date.now().toString().slice(-5)}`.slice(0, 24),
        email,
        display_name: `${SIG} ${label}`,
        role_id: role.id,
        is_active: true,
      })
      .select("id, display_name")
      .single();
    if (profileErr || !profile?.id) {
      throw new Error(profileErr?.message ?? `Failed profile ${label}`);
    }
    staffIdsToDelete.push(profile.id);
    return profile;
  }

  const { data: productBefore } = await admin
    .from("orders")
    .select("id, status")
    .eq("id", PRODUCT_MANUAL_ORDER_ID)
    .maybeSingle();
  let productDetailsBefore: Record<string, unknown> | null = null;
  if (productBefore?.id) {
    const { data } = await admin
      .from("order_delivery_details")
      .select(
        "delivery_fee_request_status,processing_fee_request_status,delivery_fee_quoted_amount,delivery_fee_status,processing_fee_waived,processing_fee_override_amount",
      )
      .eq("order_id", PRODUCT_MANUAL_ORDER_ID)
      .maybeSingle();
    productDetailsBefore = data;
  }

  try {
    const { data: roles } = await admin.from("roles").select("id, code");
    const ownerRole = (roles ?? []).find((r) => r.code === "owner");
    if (!ownerRole?.id) throw new Error("owner role missing");
    const { data: ownerStaff, error: ownerErr } = await admin
      .from("staff_profiles")
      .select("id")
      .eq("role_id", ownerRole.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (ownerErr || !ownerStaff?.id) {
      throw new Error(ownerErr?.message ?? "No owner staff");
    }
    const ownerId = ownerStaff.id;

    const vivian = await createEphemeralStaff("customer_operations", "Vivian");
    const peter = await createEphemeralStaff("customer_operations", "Peter");
    const manager = await createEphemeralStaff("manager", "Manager");

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
      recipient_phone: "0198888202",
      address_line_1: "12 Jalan 2B2",
      address_line_2: null,
      postcode: "88400",
      city: "Kota Kinabalu",
      state: "Sabah",
      recipient_notify_preference: "inform_recipient",
    };

    async function createOrder(name: string, phone: string) {
      const { data, error } = await admin.rpc("create_staff_guest_preorder", {
        p_actor_staff_id: ownerId,
        p_customer_name: name,
        p_phone: phone,
        p_email: null,
        p_order_source: "whatsapp",
        p_crew_order: false,
        p_pickup_date: "2026-09-12",
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
        p_fulfilment_method: "delivery",
        p_delivery: deliveryPayload,
      });
      if (error || !data?.id) {
        throw new Error(error?.message ?? "create failed");
      }
      check(
        data.id !== PRODUCT_MANUAL_ORDER_ID,
        "fixture is not Product manual-test order",
      );
      orderIds.push(data.id);
      return data.id as string;
    }

    // -------------------------------------------------------------------------
    // Manager direct Delivery + Processing authority
    // -------------------------------------------------------------------------
    {
      const id = await createOrder(`${SIG} MgrDirect`, "0178002201");
      const { error: qErr } = await admin.rpc(
        "set_guest_order_delivery_fee_quote",
        {
          p_order_id: id,
          p_actor_staff_id: manager.id,
          p_amount: 10,
        },
      );
      check(!qErr, "Manager can quote Delivery RM10", qErr?.message);
      check(
        (await amountDue(id)) === cakePrice + 5 + 10,
        "quote RM10 updates amountDue",
      );

      const { error: wErr } = await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: id,
        p_actor_staff_id: manager.id,
        p_reason: "mgr waive delivery",
      });
      check(!wErr, "Manager can waive Delivery Fee", wErr?.message);
      check(
        (await amountDue(id)) === cakePrice + 5,
        "Manager Delivery waive → RM0 Delivery",
      );

      const { error: rErr } = await admin.rpc(
        "restore_guest_order_delivery_fee",
        {
          p_order_id: id,
          p_actor_staff_id: manager.id,
          p_reason: "mgr restore delivery",
        },
      );
      check(!rErr, "Manager can restore Delivery Fee", rErr?.message);
      check(
        (await amountDue(id)) === cakePrice + 15,
        "Manager Delivery restore → RM10",
      );

      const { error: oErr } = await admin.rpc(
        "override_guest_order_processing_fee",
        {
          p_order_id: id,
          p_actor_staff_id: manager.id,
          p_amount: 3,
          p_reason: "mgr override",
        },
      );
      check(!oErr, "Manager can override Processing Fee", oErr?.message);
      check(
        (await amountDue(id)) === cakePrice + 3 + 10,
        "Manager Processing override RM5→RM3",
      );

      const { error: pwErr } = await admin.rpc(
        "waive_guest_order_processing_fee",
        {
          p_order_id: id,
          p_actor_staff_id: manager.id,
          p_reason: "mgr waive processing",
        },
      );
      check(!pwErr, "Manager can waive Processing Fee", pwErr?.message);
      check(
        (await amountDue(id)) === cakePrice + 10,
        "Manager Processing waive → RM0",
      );

      const { error: prErr } = await admin.rpc(
        "restore_guest_order_processing_fee",
        {
          p_order_id: id,
          p_actor_staff_id: manager.id,
          p_reason: "mgr restore processing",
        },
      );
      check(!prErr, "Manager can restore Processing Fee", prErr?.message);
      check(
        (await amountDue(id)) === cakePrice + 3 + 10,
        "Manager Processing restore → RM3",
      );
    }

    // -------------------------------------------------------------------------
    // Manager request submission denied
    // -------------------------------------------------------------------------
    {
      const id = await createOrder(`${SIG} MgrReqDeny`, "0178002202");
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: id,
        p_actor_staff_id: manager.id,
        p_amount: 10,
      });
      const { error: dReq } = await admin.rpc(
        "request_guest_order_delivery_fee_waiver",
        {
          p_order_id: id,
          p_actor_staff_id: manager.id,
          p_reason: "should fail",
        },
      );
      check(Boolean(dReq), "Manager cannot submit Delivery waiver request", dReq?.message);
      const { error: pReq } = await admin.rpc(
        "request_guest_order_processing_fee_change",
        {
          p_order_id: id,
          p_actor_staff_id: manager.id,
          p_kind: "processing_waiver",
          p_proposed_amount: null,
          p_reason: "should fail",
        },
      );
      check(
        Boolean(pReq),
        "Manager cannot submit Processing change/waiver request",
        pReq?.message,
      );
    }

    // -------------------------------------------------------------------------
    // Dual pending + pending blocks direct + independent resolve
    // -------------------------------------------------------------------------
    {
      const id = await createOrder(`${SIG} Dual`, "0178002203");
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: id,
        p_actor_staff_id: vivian.id,
        p_amount: 10,
      });
      const dueQuoted = await amountDue(id);
      check(dueQuoted === cakePrice + 15, "dual baseline cake+5+10");

      const { error: dReqErr } = await admin.rpc(
        "request_guest_order_delivery_fee_waiver",
        {
          p_order_id: id,
          p_actor_staff_id: vivian.id,
          p_reason: "VIP courtesy",
        },
      );
      check(!dReqErr, "Vivian Delivery waiver request", dReqErr?.message);
      const { error: pReqErr } = await admin.rpc(
        "request_guest_order_processing_fee_change",
        {
          p_order_id: id,
          p_actor_staff_id: peter.id,
          p_kind: "processing_override",
          p_proposed_amount: 3,
          p_reason: "Repeat customer",
        },
      );
      check(!pReqErr, "Peter Processing override request RM3", pReqErr?.message);
      let d = await loadDetails(id);
      check(
        d?.delivery_fee_request_status === "pending" &&
          d?.processing_fee_request_status === "pending",
        "dual pending coexist",
      );
      check(d?.delivery_fee_requested_by === vivian.id, "Delivery requester Vivian");
      check(d?.processing_fee_requested_by === peter.id, "Processing requester Peter");
      check((await amountDue(id)) === dueQuoted, "pending leaves amountDue unchanged");

      const { error: directD } = await admin.rpc(
        "waive_guest_order_delivery_fee",
        {
          p_order_id: id,
          p_actor_staff_id: manager.id,
          p_reason: "should block",
        },
      );
      check(
        Boolean(directD),
        "Manager direct Delivery waive denied while Delivery pending",
        directD?.message,
      );
      const { error: ownerDirectD } = await admin.rpc(
        "waive_guest_order_delivery_fee",
        {
          p_order_id: id,
          p_actor_staff_id: ownerId,
          p_reason: "should block",
        },
      );
      check(
        Boolean(ownerDirectD),
        "Owner direct Delivery waive denied while Delivery pending",
        ownerDirectD?.message,
      );
      const { error: directP } = await admin.rpc(
        "override_guest_order_processing_fee",
        {
          p_order_id: id,
          p_actor_staff_id: manager.id,
          p_amount: 2,
          p_reason: "should block",
        },
      );
      check(
        Boolean(directP),
        "Manager direct Processing override denied while Processing pending",
        directP?.message,
      );
      const { error: directPw } = await admin.rpc(
        "waive_guest_order_processing_fee",
        {
          p_order_id: id,
          p_actor_staff_id: ownerId,
          p_reason: "should block",
        },
      );
      check(
        Boolean(directPw),
        "Owner direct Processing waive denied while Processing pending",
        directPw?.message,
      );
      d = await loadDetails(id);
      check(
        d?.delivery_fee_request_status === "pending" &&
          d?.processing_fee_request_status === "pending",
        "blocked direct actions leave both pending",
      );

      const beforeApproveDue = await amountDue(id);
      const { error: apD } = await admin.rpc(
        "resolve_guest_order_delivery_fee_request",
        {
          p_order_id: id,
          p_actor_staff_id: manager.id,
          p_approve: true,
          p_note: "mgr approve delivery",
        },
      );
      check(!apD, "Manager approve Delivery waiver", apD?.message);
      d = await loadDetails(id);
      check(d?.delivery_fee_request_status === "approved", "Delivery approved");
      check(
        d?.delivery_fee_request_resolved_by === manager.id,
        "Delivery resolver = Manager",
      );
      check(
        d?.delivery_fee_requested_by === vivian.id,
        "Delivery requester attribution preserved after approve",
      );
      check(
        d?.processing_fee_request_status === "pending",
        "resolving Delivery leaves Processing pending",
      );
      check(
        Boolean(d?.delivery_fee_waived) && d?.delivery_fee_status === "quoted_waived",
        "approve Delivery → quoted_waived",
      );
      const afterApproveDue = await amountDue(id);
      check(
        afterApproveDue === cakePrice + 5,
        "Delivery approve RM10 → RM0 amountDue",
        `due=${afterApproveDue}`,
      );
      check(
        financialMateriallyAffectsConfirmation(beforeApproveDue, afterApproveDue),
        "Delivery approve is Confirmation-material",
      );

      const beforeRejectP = await amountDue(id);
      const { error: rjP } = await admin.rpc(
        "resolve_guest_order_processing_fee_request",
        {
          p_order_id: id,
          p_actor_staff_id: ownerId,
          p_approve: false,
          p_note: "owner reject processing",
        },
      );
      check(!rjP, "Owner reject Processing override", rjP?.message);
      d = await loadDetails(id);
      check(d?.processing_fee_request_status === "rejected", "Processing rejected");
      check(
        d?.processing_fee_request_resolved_by === ownerId,
        "Processing resolver = Owner",
      );
      check(
        d?.processing_fee_requested_by === peter.id,
        "Processing requester attribution preserved after reject",
      );
      check(
        d?.processing_fee_override_amount == null ||
          Number(d.processing_fee_override_amount) !== 3,
        "reject does not apply RM3 override",
      );
      const afterRejectP = await amountDue(id);
      check(
        afterRejectP === beforeRejectP,
        "Processing reject leaves amountDue unchanged",
        `due=${afterRejectP}`,
      );
      check(
        !financialMateriallyAffectsConfirmation(beforeRejectP, afterRejectP),
        "Processing reject is not Confirmation-material",
      );
    }

    // -------------------------------------------------------------------------
    // Delivery reject remains RM10; Processing approve RM3; waiver approve/reject
    // -------------------------------------------------------------------------
    {
      const rejectD = await createOrder(`${SIG} RejD`, "0178002204");
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: rejectD,
        p_actor_staff_id: vivian.id,
        p_amount: 10,
      });
      await admin.rpc("request_guest_order_delivery_fee_waiver", {
        p_order_id: rejectD,
        p_actor_staff_id: vivian.id,
        p_reason: "please waive",
      });
      const dueBefore = await amountDue(rejectD);
      const { error } = await admin.rpc(
        "resolve_guest_order_delivery_fee_request",
        {
          p_order_id: rejectD,
          p_actor_staff_id: manager.id,
          p_approve: false,
          p_note: "keep quote",
        },
      );
      check(!error, "Manager reject Delivery waiver", error?.message);
      check(
        (await amountDue(rejectD)) === dueBefore && dueBefore === cakePrice + 15,
        "Delivery reject remains RM10",
      );
      const d = await loadDetails(rejectD);
      check(d?.delivery_fee_status === "quoted", "Delivery still quoted after reject");
      check(!d?.delivery_fee_waived, "Delivery not waived after reject");
    }

    {
      const apP = await createOrder(`${SIG} ApP3`, "0178002205");
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: apP,
        p_actor_staff_id: vivian.id,
        p_amount: 10,
      });
      await admin.rpc("request_guest_order_processing_fee_change", {
        p_order_id: apP,
        p_actor_staff_id: vivian.id,
        p_kind: "processing_override",
        p_proposed_amount: 3,
        p_reason: "RM3 please",
      });
      const { error } = await admin.rpc(
        "resolve_guest_order_processing_fee_request",
        {
          p_order_id: apP,
          p_actor_staff_id: manager.id,
          p_approve: true,
          p_note: null,
        },
      );
      check(!error, "Manager approve Processing override RM3", error?.message);
      const d = await loadDetails(apP);
      check(Number(d?.processing_fee_override_amount) === 3, "override amount RM3");
      check(
        (await amountDue(apP)) === cakePrice + 3 + 10,
        "Processing RM5 → requested RM3 → approve RM3",
      );
    }

    {
      const wAp = await createOrder(`${SIG} PWaiveAp`, "0178002206");
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: wAp,
        p_actor_staff_id: vivian.id,
        p_amount: 10,
      });
      await admin.rpc("request_guest_order_processing_fee_change", {
        p_order_id: wAp,
        p_actor_staff_id: vivian.id,
        p_kind: "processing_waiver",
        p_proposed_amount: null,
        p_reason: "waive processing",
      });
      await admin.rpc("request_guest_order_delivery_fee_waiver", {
        p_order_id: wAp,
        p_actor_staff_id: peter.id,
        p_reason: "keep delivery pending",
      });
      const { error } = await admin.rpc(
        "resolve_guest_order_processing_fee_request",
        {
          p_order_id: wAp,
          p_actor_staff_id: manager.id,
          p_approve: true,
          p_note: null,
        },
      );
      check(!error, "Manager approve Processing waiver", error?.message);
      const d = await loadDetails(wAp);
      check(Boolean(d?.processing_fee_waived), "Processing waived");
      check(
        d?.delivery_fee_request_status === "pending",
        "resolving Processing leaves Delivery pending",
      );
      check(
        (await amountDue(wAp)) === cakePrice + 10,
        "Processing waiver approve → RM0 processing",
      );
    }

    {
      const wRj = await createOrder(`${SIG} PWaiveRj`, "0178002207");
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: wRj,
        p_actor_staff_id: vivian.id,
        p_amount: 10,
      });
      await admin.rpc("request_guest_order_processing_fee_change", {
        p_order_id: wRj,
        p_actor_staff_id: vivian.id,
        p_kind: "processing_waiver",
        p_proposed_amount: null,
        p_reason: "waive processing",
      });
      const dueBefore = await amountDue(wRj);
      const { error } = await admin.rpc(
        "resolve_guest_order_processing_fee_request",
        {
          p_order_id: wRj,
          p_actor_staff_id: manager.id,
          p_approve: false,
          p_note: "keep RM5",
        },
      );
      check(!error, "Manager reject Processing waiver", error?.message);
      check(
        (await amountDue(wRj)) === dueBefore && dueBefore === cakePrice + 15,
        "Processing waiver reject remains RM5",
      );
    }

    // -------------------------------------------------------------------------
    // Manager dismiss Counter requests; CO retain quote/request/own-cancel
    // -------------------------------------------------------------------------
    {
      const id = await createOrder(`${SIG} Dismiss`, "0178002208");
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: id,
        p_actor_staff_id: vivian.id,
        p_amount: 15,
      });
      await admin.rpc("request_guest_order_delivery_fee_waiver", {
        p_order_id: id,
        p_actor_staff_id: vivian.id,
        p_reason: "dismiss me",
      });
      await admin.rpc("request_guest_order_processing_fee_change", {
        p_order_id: id,
        p_actor_staff_id: peter.id,
        p_kind: "processing_waiver",
        p_proposed_amount: null,
        p_reason: "dismiss me too",
      });
      const { error: peterCancel } = await admin.rpc(
        "cancel_guest_order_delivery_fee_request",
        {
          p_order_id: id,
          p_actor_staff_id: peter.id,
          p_note: "not mine",
        },
      );
      check(Boolean(peterCancel), "Peter cannot cancel Vivian Delivery request");
      const { error: mgrCancelD } = await admin.rpc(
        "cancel_guest_order_delivery_fee_request",
        {
          p_order_id: id,
          p_actor_staff_id: manager.id,
          p_note: "mgr dismiss delivery",
        },
      );
      check(!mgrCancelD, "Manager can dismiss Counter Delivery request", mgrCancelD?.message);
      const { error: mgrCancelP } = await admin.rpc(
        "cancel_guest_order_processing_fee_request",
        {
          p_order_id: id,
          p_actor_staff_id: manager.id,
          p_note: "mgr dismiss processing",
        },
      );
      check(
        !mgrCancelP,
        "Manager can dismiss Counter Processing request",
        mgrCancelP?.message,
      );
      const d = await loadDetails(id);
      check(d?.delivery_fee_request_status === "cancelled", "Delivery cancelled by Manager");
      check(
        d?.processing_fee_request_status === "cancelled",
        "Processing cancelled by Manager",
      );
      check(
        d?.delivery_fee_request_resolved_by === manager.id,
        "Delivery cancel resolver = Manager",
      );
    }

    {
      const id = await createOrder(`${SIG} COOwn`, "0178002209");
      const { error: qErr } = await admin.rpc(
        "set_guest_order_delivery_fee_quote",
        {
          p_order_id: id,
          p_actor_staff_id: vivian.id,
          p_amount: 10,
        },
      );
      check(!qErr, "CO retains Delivery quote authority", qErr?.message);
      const { error: dReq } = await admin.rpc(
        "request_guest_order_delivery_fee_waiver",
        {
          p_order_id: id,
          p_actor_staff_id: vivian.id,
          p_reason: "own cancel later",
        },
      );
      check(!dReq, "CO retains Delivery waiver request authority", dReq?.message);
      const { error: pReq } = await admin.rpc(
        "request_guest_order_processing_fee_change",
        {
          p_order_id: id,
          p_actor_staff_id: vivian.id,
          p_kind: "processing_waiver",
          p_proposed_amount: null,
          p_reason: "own processing",
        },
      );
      check(!pReq, "CO retains Processing request authority", pReq?.message);
      const { error: wErr } = await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: id,
        p_actor_staff_id: vivian.id,
        p_reason: "no",
      });
      check(Boolean(wErr), "CO denied direct Delivery waive", wErr?.message);
      const { error: oErr } = await admin.rpc(
        "override_guest_order_processing_fee",
        {
          p_order_id: id,
          p_actor_staff_id: vivian.id,
          p_amount: 3,
          p_reason: "no",
        },
      );
      check(Boolean(oErr), "CO denied Processing override", oErr?.message);
      const { error: rErr } = await admin.rpc(
        "restore_guest_order_delivery_fee",
        {
          p_order_id: id,
          p_actor_staff_id: vivian.id,
          p_reason: "no",
        },
      );
      check(Boolean(rErr), "CO denied Delivery restore", rErr?.message);
      const { error: apErr } = await admin.rpc(
        "resolve_guest_order_delivery_fee_request",
        {
          p_order_id: id,
          p_actor_staff_id: vivian.id,
          p_approve: true,
          p_note: null,
        },
      );
      check(Boolean(apErr), "CO denied request resolution", apErr?.message);
      const { error: ownCancel } = await admin.rpc(
        "cancel_guest_order_delivery_fee_request",
        {
          p_order_id: id,
          p_actor_staff_id: vivian.id,
          p_note: "changed mind",
        },
      );
      check(!ownCancel, "CO retains own-request cancellation", ownCancel?.message);
    }

    // -------------------------------------------------------------------------
    // Owner authority unchanged + historical Enable Delivery Charges
    // -------------------------------------------------------------------------
    {
      const id = await createOrder(`${SIG} Owner`, "0178002210");
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: id,
        p_actor_staff_id: ownerId,
        p_amount: 10,
      });
      const { error: wErr } = await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: id,
        p_actor_staff_id: ownerId,
        p_reason: "owner waive",
      });
      check(!wErr, "Owner retains direct Delivery waive", wErr?.message);
      const { error: rErr } = await admin.rpc(
        "restore_guest_order_delivery_fee",
        {
          p_order_id: id,
          p_actor_staff_id: ownerId,
          p_reason: "owner restore",
        },
      );
      check(!rErr, "Owner retains Delivery restore", rErr?.message);
      await admin.rpc("request_guest_order_delivery_fee_waiver", {
        p_order_id: id,
        p_actor_staff_id: vivian.id,
        p_reason: "owner resolve",
      });
      const { error: apErr } = await admin.rpc(
        "resolve_guest_order_delivery_fee_request",
        {
          p_order_id: id,
          p_actor_staff_id: ownerId,
          p_approve: true,
          p_note: null,
        },
      );
      check(!apErr, "Owner retains request resolution", apErr?.message);
    }

    {
      const hist = await createOrder(`${SIG} Hist`, "0178002211");
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
        .eq("order_id", hist);
      await admin.from("order_adjustments").delete().eq("order_id", hist);
      const { error: mgrInit } = await admin.rpc(
        "init_guest_order_delivery_finance",
        {
          p_order_id: hist,
          p_actor_staff_id: manager.id,
        },
      );
      check(
        Boolean(mgrInit),
        "Manager denied historical Enable Delivery Charges",
        mgrInit?.message,
      );
      const { error: ownerInit } = await admin.rpc(
        "init_guest_order_delivery_finance",
        {
          p_order_id: hist,
          p_actor_staff_id: ownerId,
        },
      );
      check(!ownerInit, "Owner retains historical Enable Delivery Charges", ownerInit?.message);
      const d = await loadDetails(hist);
      check(Boolean(d?.delivery_finance_enabled), "Owner init enables finance");
    }

    // -------------------------------------------------------------------------
    // 2B-1 stale Delivery re-quote auto-cancel unchanged
    // -------------------------------------------------------------------------
    {
      const id = await createOrder(`${SIG} Stale`, "0178002212");
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: id,
        p_actor_staff_id: vivian.id,
        p_amount: 15,
      });
      await admin.rpc("request_guest_order_delivery_fee_waiver", {
        p_order_id: id,
        p_actor_staff_id: vivian.id,
        p_reason: "stale soon",
      });
      await admin.rpc("request_guest_order_processing_fee_change", {
        p_order_id: id,
        p_actor_staff_id: vivian.id,
        p_kind: "processing_waiver",
        p_proposed_amount: null,
        p_reason: "must survive",
      });
      const { data, error } = await admin.rpc(
        "set_guest_order_delivery_fee_quote",
        {
          p_order_id: id,
          p_actor_staff_id: vivian.id,
          p_amount: 10,
        },
      );
      check(!error, "2B-1 Delivery re-quote still works", error?.message);
      const d = await loadDetails(id);
      check(
        d?.delivery_fee_request_status === "cancelled",
        "re-quote auto-cancels Delivery request only",
      );
      check(
        d?.processing_fee_request_status === "pending",
        "Processing survives Delivery re-quote",
      );
      check(
        Boolean(
          (data as { cancelled_pending_delivery_waiver_request?: boolean })
            ?.cancelled_pending_delivery_waiver_request,
        ),
        "quote RPC reports cancelled pending Delivery waiver",
      );
    }

    // -------------------------------------------------------------------------
    // Partial payment + approve waive + immutability + overpayment
    // -------------------------------------------------------------------------
    {
      const id = await createOrder(`${SIG} Pay`, "0178002213");
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: id,
        p_actor_staff_id: vivian.id,
        p_amount: 10,
      });
      await admin
        .from("orders")
        .update({ status: "awaiting_payment" })
        .eq("id", id);
      const partial = 50;
      const { data: payPartial, error: payErr } = await admin.rpc(
        "record_and_verify_guest_order_payment",
        {
          p_order_id: id,
          p_amount: partial,
          p_method: "wb_qr",
          p_method_description: null,
          p_paid_at: new Date().toISOString(),
          p_reference_note: `${SIG}-partial`,
          p_verifier_staff_id: ownerId,
        },
      );
      check(!payErr, "partial payment recorded", payErr?.message);
      const paymentId = payPartial?.payment_id as string | undefined;
      await admin.rpc("request_guest_order_delivery_fee_waiver", {
        p_order_id: id,
        p_actor_staff_id: vivian.id,
        p_reason: "after partial",
      });
      const { data: allocBefore } = await admin
        .from("payment_allocations")
        .select("payment_id, amount")
        .eq("order_id", id);
      const allocSnap = JSON.stringify(allocBefore);
      const { data: payRowBefore } = paymentId
        ? await admin
            .from("payments")
            .select("id, amount, status, method, reference_note")
            .eq("id", paymentId)
            .single()
        : { data: null };
      const payRowSnap = JSON.stringify(payRowBefore);

      const beforeDue = await amountDue(id);
      const beforeSettle = await tsSettlement(id);
      const { error: apErr } = await admin.rpc(
        "resolve_guest_order_delivery_fee_request",
        {
          p_order_id: id,
          p_actor_staff_id: manager.id,
          p_approve: true,
          p_note: null,
        },
      );
      check(!apErr, "Manager approve Delivery after partial payment", apErr?.message);
      const afterSettle = await applyAppLayerAfterFinanceMutation({
        orderId: id,
        beforeAmountDue: beforeDue,
        beforeStatus: "awaiting_payment",
        beforeNetReceived: beforeSettle.netReceived,
        staffId: manager.id,
      });
      check(
        afterSettle.amountDue === cakePrice + 5,
        "partial-payment approve lowers amountDue",
        `due=${afterSettle.amountDue}`,
      );
      check(
        Math.abs(afterSettle.remainingBalance - Math.max(0, afterSettle.amountDue - partial)) <
          0.001,
        "partial-payment remaining balance reconciles",
      );
      const { data: allocAfter } = await admin
        .from("payment_allocations")
        .select("payment_id, amount")
        .eq("order_id", id);
      check(
        JSON.stringify(allocAfter) === allocSnap,
        "verified allocations immutable after approve",
      );
      if (paymentId) {
        const { data: payRowAfter } = await admin
          .from("payments")
          .select("id, amount, status, method, reference_note")
          .eq("id", paymentId)
          .single();
        check(
          JSON.stringify(payRowAfter) === payRowSnap,
          "verified payment row immutable after approve",
        );
      }

    }

    {
      const id = await createOrder(`${SIG} Overpay`, "0178002216");
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: id,
        p_actor_staff_id: manager.id,
        p_amount: 10,
      });
      const dueFull = await amountDue(id);
      await admin
        .from("orders")
        .update({ status: "awaiting_payment" })
        .eq("id", id);
      const { error: payFullErr } = await admin.rpc(
        "record_and_verify_guest_order_payment",
        {
          p_order_id: id,
          p_amount: dueFull,
          p_method: "wb_qr",
          p_method_description: null,
          p_paid_at: new Date().toISOString(),
          p_reference_note: `${SIG}-paid-full`,
          p_verifier_staff_id: ownerId,
        },
      );
      check(!payFullErr, "paid-order full payment recorded", payFullErr?.message);
      await admin
        .from("orders")
        .update({ status: "paid", payment_status: "paid" })
        .eq("id", id);
      const { error: waiveErr } = await admin.rpc(
        "waive_guest_order_delivery_fee",
        {
          p_order_id: id,
          p_actor_staff_id: manager.id,
          p_reason: "overpay waive",
        },
      );
      check(!waiveErr, "Manager waive Delivery on Paid order", waiveErr?.message);
      const paidSettle = await tsSettlement(id);
      check(
        paidSettle.overpayment > 0,
        "paid-order Delivery waive creates overpayment",
        `over=${paidSettle.overpayment}`,
      );
    }

    // -------------------------------------------------------------------------
    // Confirmation materiality + frozen sent body
    // -------------------------------------------------------------------------
    {
      const id = await createOrder(`${SIG} Conf`, "0178002214");
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: id,
        p_actor_staff_id: vivian.id,
        p_amount: 10,
      });
      const frozenBody = `${SIG} FROZEN CONFIRMATION BODY — do not rewrite`;
      const { data: snap, error: confErr } = await admin
        .from("order_confirmation_snapshots")
        .insert({
          order_id: id,
          version: 1,
          lifecycle_status: "sent",
          message_body: frozenBody,
          snapshot_payload: {},
          sent_at: new Date().toISOString(),
        })
        .select("id, message_body")
        .single();
      check(!confErr && Boolean(snap?.id), "insert sent confirmation", confErr?.message);
      await admin
        .from("orders")
        .update({
          status: "pending_confirmation",
          confirmation_needs_resend: false,
        })
        .eq("id", id);

      await admin.rpc("request_guest_order_delivery_fee_waiver", {
        p_order_id: id,
        p_actor_staff_id: vivian.id,
        p_reason: "conf reject first",
      });
      const beforeRejectDue = await amountDue(id);
      await admin.rpc("resolve_guest_order_delivery_fee_request", {
        p_order_id: id,
        p_actor_staff_id: manager.id,
        p_approve: false,
        p_note: "no materiality",
      });
      await applyAppLayerAfterFinanceMutation({
        orderId: id,
        beforeAmountDue: beforeRejectDue,
        beforeStatus: "pending_confirmation",
        beforeNetReceived: 0,
        staffId: manager.id,
      });
      const { data: afterReject } = await admin
        .from("orders")
        .select("confirmation_needs_resend")
        .eq("id", id)
        .single();
      check(
        afterReject?.confirmation_needs_resend === false,
        "reject does not falsely outdate Confirmation",
      );

      await admin.rpc("request_guest_order_delivery_fee_waiver", {
        p_order_id: id,
        p_actor_staff_id: vivian.id,
        p_reason: "conf approve",
      });
      const beforeApproveDue = await amountDue(id);
      await admin.rpc("resolve_guest_order_delivery_fee_request", {
        p_order_id: id,
        p_actor_staff_id: manager.id,
        p_approve: true,
        p_note: "material",
      });
      await applyAppLayerAfterFinanceMutation({
        orderId: id,
        beforeAmountDue: beforeApproveDue,
        beforeStatus: "pending_confirmation",
        beforeNetReceived: 0,
        staffId: manager.id,
      });
      const { data: afterApprove } = await admin
        .from("orders")
        .select("confirmation_needs_resend")
        .eq("id", id)
        .single();
      check(
        afterApprove?.confirmation_needs_resend === true,
        "approve material amountDue outdates Confirmation",
      );
      const { data: confAfter } = await admin
        .from("order_confirmation_snapshots")
        .select("message_body, lifecycle_status")
        .eq("id", snap!.id)
        .single();
      check(
        confAfter?.message_body === frozenBody,
        "frozen sent message_body unchanged",
      );
    }

    // -------------------------------------------------------------------------
    // Surviving pending Counter request remains resolvable (post-migration)
    // -------------------------------------------------------------------------
    {
      const id = await createOrder(`${SIG} Survive`, "0178002215");
      await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: id,
        p_actor_staff_id: vivian.id,
        p_amount: 10,
      });
      await admin.rpc("request_guest_order_delivery_fee_waiver", {
        p_order_id: id,
        p_actor_staff_id: vivian.id,
        p_reason: "survive then resolve",
      });
      const dBefore = await loadDetails(id);
      check(dBefore?.delivery_fee_request_status === "pending", "pending request exists");
      const { error } = await admin.rpc("resolve_guest_order_delivery_fee_request", {
        p_order_id: id,
        p_actor_staff_id: manager.id,
        p_approve: true,
        p_note: "post-migration resolve",
      });
      check(!error, "pending Counter request remains resolvable", error?.message);
    }

    pass("schema+RPC probe accepted");
  } finally {
    for (const id of orderIds) {
      try {
        await cleanupOrder(id);
      } catch (e) {
        fail(
          "fixture cleanup",
          e instanceof Error ? e.message : String(e),
        );
      }
    }
    for (const sid of staffIdsToDelete) {
      await admin.from("staff_profiles").delete().eq("id", sid);
    }
    for (const uid of authUserIdsToDelete) {
      await admin.auth.admin.deleteUser(uid);
    }
  }

  check(
    !orderIds.includes(PRODUCT_MANUAL_ORDER_ID),
    "Product manual-test order never in fixture set",
  );
  if (productBefore?.id) {
    const { data: productAfter } = await admin
      .from("orders")
      .select("id, status")
      .eq("id", PRODUCT_MANUAL_ORDER_ID)
      .maybeSingle();
    const { data: productDetailsAfter } = await admin
      .from("order_delivery_details")
      .select(
        "delivery_fee_request_status,processing_fee_request_status,delivery_fee_quoted_amount,delivery_fee_status,processing_fee_waived,processing_fee_override_amount",
      )
      .eq("order_id", PRODUCT_MANUAL_ORDER_ID)
      .maybeSingle();
    check(Boolean(productAfter?.id), "Product manual-test order still exists");
    check(
      productAfter?.status === productBefore.status,
      "Product manual-test order status unchanged",
    );
    check(
      JSON.stringify(productDetailsAfter) === JSON.stringify(productDetailsBefore),
      "Product manual-test Delivery details unchanged",
    );
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) {
    console.error("Failed:");
    for (const f of failed) console.error(` - ${f.label}: ${f.detail ?? ""}`);
    process.exit(1);
  }
  console.log("2B-2 Manager authority LIVE OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
