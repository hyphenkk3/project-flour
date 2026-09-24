/**
 * Live atomic overpayment refund + timeline.
 * Run: npx tsx scripts/test-payment-correction-atomic-live.ts
 *
 * Isolated fixtures only. Requires
 * 20260924120000_record_overpayment_refund_atomic.sql on DEV.
 * Does not change production.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

function rpcMessage(error: { message?: string } | null | undefined): string {
  return error?.message ?? "";
}

const SIG = `M9REF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

  const probe = await admin.rpc("record_overpayment_refund", {
    p_order_id: "00000000-0000-4000-8000-000000000001",
    p_amount: 1,
    p_reason: null,
    p_actor_staff_id: "00000000-0000-4000-8000-000000000002",
    p_payment_snapshot: [],
  });
  const probeMsg = rpcMessage(probe.error);
  if (/could not find the function|schema cache|does not exist/i.test(probeMsg)) {
    console.log(
      "SKIP live DB (apply supabase/migrations/20260924120000_record_overpayment_refund_atomic.sql).",
    );
    return;
  }

  const { data: roles, error: roleErr } = await admin
    .from("roles")
    .select("id, code");
  if (roleErr) throw roleErr;
  const roleId = (code: string) =>
    roles?.find((row) => row.code === code)?.id ?? null;

  async function staffFor(code: string) {
    const id = roleId(code);
    if (!id) return null;
    const { data } = await admin
      .from("staff_profiles")
      .select("id")
      .eq("role_id", id)
      .eq("is_active", true)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    return data?.id ?? null;
  }

  const ownerId = await staffFor("owner");
  const managerId = await staffFor("manager");
  const bakeryId = await staffFor("bakery");
  const counterId = await staffFor("customer_operations");
  assert.ok(ownerId, "need an active Owner staff row");

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

  const orderIds: string[] = [];

  async function cleanupOrder(orderId: string) {
    const { data: allocations } = await admin
      .from("payment_allocations")
      .select("payment_id")
      .eq("order_id", orderId);
    await admin.from("payment_allocations").delete().eq("order_id", orderId);
    await admin.from("refunds").delete().eq("order_id", orderId);
    const paymentIds = [
      ...new Set((allocations ?? []).map((row) => String(row.payment_id))),
    ];
    if (paymentIds.length > 0) {
      await admin.from("payments").delete().in("id", paymentIds);
    }
    await admin.from("order_adjustments").delete().eq("order_id", orderId);
    const { error } = await admin.from("orders").delete().eq("id", orderId);
    if (error) {
      throw new Error(`cleanup failed for ${orderId}: ${error.message}`);
    }
  }

  async function createPaidOverpayOrder() {
    const { data, error } = await admin.rpc("create_staff_guest_preorder", {
      p_actor_staff_id: ownerId,
      p_customer_name: `${SIG} Guest`,
      p_phone: "0177001999",
      p_email: null,
      p_order_source: "whatsapp",
      p_crew_order: false,
      p_pickup_date: "2026-10-15",
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
      p_internal_notes: `${SIG}-atomic`,
      p_fulfilment_method: "pickup",
      p_delivery: null,
    });
    if (error || !data?.id) {
      throw new Error(error?.message ?? "create order failed");
    }
    const orderId = data.id as string;
    orderIds.push(orderId);

    const { error: statusErr } = await admin
      .from("orders")
      .update({ status: "awaiting_payment" })
      .eq("id", orderId);
    if (statusErr) throw statusErr;

    const { data: due } = await admin.rpc("order_amount_due", {
      p_order_id: orderId,
    });
    const amountDue = Number(due);
    const paid = Number((amountDue + 20).toFixed(2));
    const { error: payErr } = await admin.rpc(
      "record_and_verify_guest_order_payment",
      {
        p_order_id: orderId,
        p_amount: paid,
        p_method: "wb_qr",
        p_method_description: null,
        p_paid_at: new Date().toISOString(),
        p_reference_note: `${SIG}-overpay`,
        p_verifier_staff_id: ownerId,
      },
    );
    if (payErr) throw payErr;
    return { orderId, amountDue, paid };
  }

  async function refundRows(orderId: string) {
    const { data, error } = await admin
      .from("refunds")
      .select("id, amount, status, reason")
      .eq("order_id", orderId);
    if (error) throw error;
    return data ?? [];
  }

  async function timelineRows(orderId: string) {
    const { data, error } = await admin
      .from("order_timeline_events")
      .select("id, event_type, metadata")
      .eq("order_id", orderId)
      .eq("event_type", "payment_correction_recorded");
    if (error) throw error;
    return data ?? [];
  }

  try {
    const bakeryDenied = await admin.rpc("record_overpayment_refund", {
      p_order_id: "00000000-0000-4000-8000-000000000001",
      p_amount: 1,
      p_reason: null,
      p_actor_staff_id: bakeryId,
      p_payment_snapshot: [],
    });
    if (bakeryId) {
      assert.match(
        rpcMessage(bakeryDenied.error),
        /Only Owner or Manager may record a payment correction/i,
      );
    }

    const counterDenied = await admin.rpc("record_overpayment_refund", {
      p_order_id: "00000000-0000-4000-8000-000000000001",
      p_amount: 1,
      p_reason: null,
      p_actor_staff_id: counterId,
      p_payment_snapshot: [],
    });
    if (counterId) {
      assert.match(
        rpcMessage(counterDenied.error),
        /Only Owner or Manager may record a payment correction/i,
      );
    }

    const missingActor = await admin.rpc("record_overpayment_refund", {
      p_order_id: "00000000-0000-4000-8000-000000000001",
      p_amount: 1,
      p_reason: null,
      p_actor_staff_id: null,
      p_payment_snapshot: [],
    });
    assert.match(
      rpcMessage(missingActor.error),
      /Staff actor is required|Not authenticated|Not authorized/i,
    );

    const { orderId, paid } = await createPaidOverpayOrder();

    const invalidAmount = await admin.rpc("record_overpayment_refund", {
      p_order_id: orderId,
      p_amount: 0,
      p_reason: null,
      p_actor_staff_id: ownerId,
      p_payment_snapshot: [],
    });
    assert.match(rpcMessage(invalidAmount.error), /valid refund amount/i);
    assert.equal((await refundRows(orderId)).length, 0);
    assert.equal((await timelineRows(orderId)).length, 0);

    const tooMuch = await admin.rpc("record_overpayment_refund", {
      p_order_id: orderId,
      p_amount: 20.01,
      p_reason: null,
      p_actor_staff_id: ownerId,
      p_payment_snapshot: [],
    });
    assert.match(rpcMessage(tooMuch.error), /exceeds remaining overpayment/i);
    assert.equal((await refundRows(orderId)).length, 0);
    assert.equal((await timelineRows(orderId)).length, 0);

    const actor = managerId ?? ownerId;
    const { data: refundId, error: refundErr } = await admin.rpc(
      "record_overpayment_refund",
      {
        p_order_id: orderId,
        p_amount: 10,
        p_reason: `${SIG} reason`,
        p_actor_staff_id: actor,
        p_payment_snapshot: [{ amount: paid, method: "wb_qr" }],
      },
    );
    assert.equal(refundErr, null, rpcMessage(refundErr));
    assert.ok(refundId);

    const refunds = await refundRows(orderId);
    assert.equal(refunds.length, 1);
    assert.equal(Number(refunds[0]?.amount), 10);
    assert.equal(refunds[0]?.status, "recorded");
    assert.equal(refunds[0]?.reason, `${SIG} reason`);

    const events = await timelineRows(orderId);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.event_type, "payment_correction_recorded");
    const metadata = (events[0]?.metadata ?? {}) as Record<string, unknown>;
    assert.equal(metadata.correction_type, "overpayment_refund");
    assert.equal(Number(metadata.amount), 10);
    assert.equal(metadata.reason, `${SIG} reason`);
    assert.equal(Number(metadata.remaining_excess), 10);

    const noExcess = await admin.rpc("record_overpayment_refund", {
      p_order_id: orderId,
      p_amount: 10.01,
      p_reason: null,
      p_actor_staff_id: ownerId,
      p_payment_snapshot: [],
    });
    assert.match(
      rpcMessage(noExcess.error),
      /exceeds remaining overpayment|no overpayment/i,
    );
    assert.equal((await refundRows(orderId)).length, 1);
    assert.equal((await timelineRows(orderId)).length, 1);

    console.log("PASS payment correction atomic (live)");
  } finally {
    const failures: string[] = [];
    for (const id of orderIds) {
      try {
        await cleanupOrder(id);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (failures.length > 0) {
      throw new Error(failures.join("; "));
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
