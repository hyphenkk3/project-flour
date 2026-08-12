/**
 * M4-P3 Slice 2B-1 — live independent Delivery/Processing fee request authority.
 *
 * Prerequisites:
 *   apply 20260811200000_m4_p3_independent_fee_requests.sql
 *   Expected SHA-256:
 *   cc6b778d1ea69422273fed9756685b4d6bb9fcb312e5b0946e20cbfb69cde0ed
 *
 * Run: npx tsx scripts/test-m4-p3-slice2b1-independent-fee-requests-live.ts
 *
 * Exit 2 if migration not applied. Does NOT touch tmp/.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const SIG = `M4P3S2B1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EXPECTED_HASH =
  "cc6b778d1ea69422273fed9756685b4d6bb9fcb312e5b0946e20cbfb69cde0ed";

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
    "supabase/migrations/20260811200000_m4_p3_independent_fee_requests.sql",
  );
  const migrationHash = createHash("sha256")
    .update(readFileSync(migrationPath))
    .digest("hex");
  console.log(`2B-1 migration sha256=${migrationHash}`);
  assert.equal(migrationHash, EXPECTED_HASH);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Schema probe
  const schemaProbe = await admin
    .from("order_delivery_details")
    .select(
      "delivery_fee_request_status,processing_fee_request_status,processing_fee_request_kind",
    )
    .limit(1);
  if (schemaProbe.error) {
    console.error("BLOCKED: independent request columns missing.");
    console.error(schemaProbe.error.message);
    process.exit(2);
  }

  const cancelProbe = await admin.rpc("cancel_guest_order_delivery_fee_request", {
    p_order_id: "00000000-0000-0000-0000-000000000000",
    p_actor_staff_id: "00000000-0000-0000-0000-000000000000",
    p_note: null,
  });
  const cancelMsg = cancelProbe.error?.message ?? "";
  if (/Could not find the function|schema cache|does not exist/i.test(cancelMsg)) {
    console.error("BLOCKED: cancel_guest_order_delivery_fee_request missing.");
    console.error(cancelMsg);
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

  async function cleanupOrder(orderId: string) {
    const steps = [
      () => admin.from("payment_allocations").delete().eq("order_id", orderId),
      () => admin.from("refunds").delete().eq("order_id", orderId),
      () => admin.from("order_adjustments").delete().eq("order_id", orderId),
      () => admin.from("orders").delete().eq("id", orderId),
    ];
    for (const run of steps) {
      const { error } = await run();
      if (error) {
        throw new Error(`2B-1 cleanup failed for ${orderId}: ${error.message}`);
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
    const email = `m4p3s2b1-${label}-${Date.now()}@whitebird.dev`;
    const { data: authCreated, error: authErr } =
      await admin.auth.admin.createUser({
        email,
        password: `Tmp2B1_${Date.now()}!`,
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
        username: `s2b1${label}${Date.now().toString().slice(-5)}`.slice(0, 24),
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
      recipient_phone: "0198888201",
      address_line_1: "12 Jalan 2B1",
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
      orderIds.push(data.id);
      return data.id as string;
    }

    const orderId = await createOrder(`${SIG} Dual`, "0177002101");
    const baseDue = cakePrice + 5;

    // 1–3 Vivian quotes RM15 → amountDue changes
    {
      const before = await amountDue(orderId);
      check(before === baseDue, "pre-quote due = cake+processing", `due=${before}`);
      const { error } = await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: orderId,
        p_actor_staff_id: vivian.id,
        p_amount: 15,
      });
      check(!error, "1 Vivian quote RM15", error?.message);
      const due = await amountDue(orderId);
      check(due === baseDue + 15, "2 quote changes amountDue", `due=${due}`);
      const d = await loadDetails(orderId);
      check(d?.delivery_fee_status === "quoted", "quote status quoted");
      check(Number(d?.delivery_fee_quoted_amount) === 15, "quoted amount 15");
    }

    // RM0 quote rejected
    {
      const { error } = await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: orderId,
        p_actor_staff_id: vivian.id,
        p_amount: 0,
      });
      check(Boolean(error), "16 RM0 cannot be Delivery quote", error?.message);
    }

    // 4–5 Delivery waiver request; amountDue unchanged
    {
      const before = await amountDue(orderId);
      const { error } = await admin.rpc(
        "request_guest_order_delivery_fee_waiver",
        {
          p_order_id: orderId,
          p_actor_staff_id: vivian.id,
          p_reason: "VIP courtesy",
        },
      );
      check(!error, "4 Vivian requests Delivery waiver", error?.message);
      const due = await amountDue(orderId);
      check(due === before, "5 pending leaves amountDue unchanged", `due=${due}`);
      const d = await loadDetails(orderId);
      check(
        d?.delivery_fee_request_status === "pending",
        "Delivery request pending",
      );
      check(
        d?.delivery_fee_requested_by === vivian.id,
        "21 Delivery requester attribution",
      );
    }

    // 6–7 Processing waiver while Delivery still pending — both coexist
    {
      const { error } = await admin.rpc(
        "request_guest_order_processing_fee_change",
        {
          p_order_id: orderId,
          p_actor_staff_id: vivian.id,
          p_kind: "processing_waiver",
          p_proposed_amount: null,
          p_reason: "Repeat customer",
        },
      );
      check(
        !error,
        "6 Vivian requests Processing waiver while Delivery pending",
        error?.message,
      );
      const d = await loadDetails(orderId);
      check(
        d?.delivery_fee_request_status === "pending" &&
          d?.processing_fee_request_status === "pending",
        "7 both requests coexist",
      );
      check(
        d?.processing_fee_requested_by === vivian.id,
        "21 Processing requester attribution",
      );
    }

    // 15 RM0 cannot be Processing override request
    {
      const { error } = await admin.rpc(
        "request_guest_order_processing_fee_change",
        {
          p_order_id: orderId,
          p_actor_staff_id: vivian.id,
          p_kind: "processing_override",
          p_proposed_amount: 0,
          p_reason: "should fail",
        },
      );
      check(Boolean(error), "15 RM0 cannot be Processing override", error?.message);
      const d = await loadDetails(orderId);
      check(
        d?.processing_fee_request_status === "pending" &&
          d?.processing_fee_request_kind === "processing_waiver",
        "failed override did not clobber Processing waiver pending",
      );
    }

    // 10 Peter cannot cancel Vivian's Delivery request
    {
      const { error } = await admin.rpc(
        "cancel_guest_order_delivery_fee_request",
        {
          p_order_id: orderId,
          p_actor_staff_id: peter.id,
          p_note: "peter attempt",
        },
      );
      check(Boolean(error), "10 Peter cannot cancel Vivian request", error?.message);
      const d = await loadDetails(orderId);
      check(
        d?.delivery_fee_request_status === "pending",
        "Delivery still pending after Peter deny",
      );
    }

    // 17–18 Counter cannot directly waive
    {
      const { error: dErr } = await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: vivian.id,
        p_reason: "no",
      });
      check(Boolean(dErr), "18 Counter cannot directly waive Delivery", dErr?.message);
      const { error: pErr } = await admin.rpc(
        "waive_guest_order_processing_fee",
        {
          p_order_id: orderId,
          p_actor_staff_id: vivian.id,
          p_reason: "no",
        },
      );
      check(
        Boolean(pErr),
        "17 Counter cannot directly waive Processing",
        pErr?.message,
      );
      const { error: oErr } = await admin.rpc(
        "override_guest_order_processing_fee",
        {
          p_order_id: orderId,
          p_actor_staff_id: vivian.id,
          p_amount: 3,
          p_reason: "no",
        },
      );
      check(
        Boolean(oErr),
        "17 Counter cannot override Processing",
        oErr?.message,
      );
      const { error: rErr } = await admin.rpc(
        "restore_guest_order_delivery_fee",
        {
          p_order_id: orderId,
          p_actor_staff_id: vivian.id,
          p_reason: "no",
        },
      );
      check(Boolean(rErr), "18 Counter cannot restore Delivery", rErr?.message);
    }

    // 19 Manager 2B-2: can quote + direct waive; cannot submit request
    {
      const mgrOrder = await createOrder(`${SIG} Mgr`, "0177002102");
      const { error: qErr } = await admin.rpc(
        "set_guest_order_delivery_fee_quote",
        {
          p_order_id: mgrOrder,
          p_actor_staff_id: manager.id,
          p_amount: 10,
        },
      );
      check(!qErr, "19 Manager can quote", qErr?.message);
      const { error: reqErr } = await admin.rpc(
        "request_guest_order_delivery_fee_waiver",
        {
          p_order_id: mgrOrder,
          p_actor_staff_id: manager.id,
          p_reason: "manager ask",
        },
      );
      check(
        Boolean(reqErr),
        "19 Manager cannot request Delivery waiver",
        reqErr?.message,
      );
      const { error: wErr } = await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: mgrOrder,
        p_actor_staff_id: manager.id,
        p_reason: "manager direct",
      });
      check(!wErr, "19 Manager can directly waive", wErr?.message);
    }

    // 9 Vivian cancels her own Delivery request — Processing survives
    {
      const { error } = await admin.rpc(
        "cancel_guest_order_delivery_fee_request",
        {
          p_order_id: orderId,
          p_actor_staff_id: vivian.id,
          p_note: "changed mind",
        },
      );
      check(!error, "9 Vivian can cancel her Delivery request", error?.message);
      const d = await loadDetails(orderId);
      check(
        d?.delivery_fee_request_status === "cancelled",
        "Delivery cancelled",
      );
      check(
        d?.processing_fee_request_status === "pending",
        "8 cancelling Delivery does not mutate Processing",
      );
      const { data: events } = await admin
        .from("order_timeline_events")
        .select("event_type, metadata, actor_staff_id")
        .eq("order_id", orderId)
        .eq("event_type", "delivery_fee_waiver_request_cancelled")
        .order("created_at", { ascending: false })
        .limit(1);
      const ev = events?.[0];
      check(
        ev?.actor_staff_id === vivian.id &&
          (ev?.metadata as { superseded_by_delivery_fee_change?: boolean })
            ?.superseded_by_delivery_fee_change === false,
        "cancel audit truthful (requester cancel)",
      );
    }

    // Re-request Delivery waiver for stale-cancel test
    {
      const { error } = await admin.rpc(
        "request_guest_order_delivery_fee_waiver",
        {
          p_order_id: orderId,
          p_actor_staff_id: vivian.id,
          p_reason: "again please",
        },
      );
      check(!error, "re-request Delivery waiver for stale test", error?.message);
    }

    // 12–14 Delivery re-quote auto-cancels ONLY Delivery; Processing survives
    {
      const beforeDue = await amountDue(orderId);
      const { data, error } = await admin.rpc(
        "set_guest_order_delivery_fee_quote",
        {
          p_order_id: orderId,
          p_actor_staff_id: vivian.id,
          p_amount: 10,
        },
      );
      check(!error, "12 Delivery re-quote to RM10", error?.message);
      const d = await loadDetails(orderId);
      check(
        d?.delivery_fee_request_status === "cancelled",
        "12 auto-cancels Delivery request",
      );
      check(
        d?.processing_fee_request_status === "pending",
        "14 Processing survives Delivery re-quote",
      );
      check(
        Number(d?.delivery_fee_quoted_amount) === 10,
        "new quote amount 10",
      );
      const due = await amountDue(orderId);
      check(due === beforeDue - 5, "re-quote updates amountDue 15→10", `due=${due}`);
      check(
        Boolean(
          (data as { cancelled_pending_delivery_waiver_request?: boolean })
            ?.cancelled_pending_delivery_waiver_request,
        ),
        "quote RPC reports cancelled pending Delivery waiver",
      );
      const { data: events } = await admin
        .from("order_timeline_events")
        .select("event_type, metadata")
        .eq("order_id", orderId)
        .eq("event_type", "delivery_fee_waiver_request_cancelled")
        .order("created_at", { ascending: false })
        .limit(3);
      const superseded = (events ?? []).find(
        (e) =>
          (e.metadata as { superseded_by_delivery_fee_change?: boolean })
            ?.superseded_by_delivery_fee_change === true,
      );
      check(Boolean(superseded), "13 superseded cancellation audit truthful");
    }

    // 11 Owner can cancel Processing pending
    {
      const { error } = await admin.rpc(
        "cancel_guest_order_processing_fee_request",
        {
          p_order_id: orderId,
          p_actor_staff_id: ownerId,
          p_note: "Owner dismiss",
        },
      );
      check(!error, "11 Owner can cancel Processing request", error?.message);
      const d = await loadDetails(orderId);
      check(
        d?.processing_fee_request_status === "cancelled",
        "Processing cancelled by Owner",
      );
      check(
        d?.processing_fee_request_resolved_by === ownerId,
        "Owner resolver attribution",
      );
    }

    // 20 Owner authority unchanged — direct waive still works
    {
      const { error } = await admin.rpc("waive_guest_order_delivery_fee", {
        p_order_id: orderId,
        p_actor_staff_id: ownerId,
        p_reason: "Owner waive",
      });
      check(!error, "20 Owner can still waive Delivery directly", error?.message);
      const due = await amountDue(orderId);
      check(due === cakePrice + 5, "Owner waive → due without Delivery fee", `due=${due}`);
    }

    // Bakery cannot quote
    {
      const bakery = await createEphemeralStaff("bakery", "Bakery");
      const bakeryOrder = await createOrder(`${SIG} Bakery`, "0177002103");
      const { error } = await admin.rpc("set_guest_order_delivery_fee_quote", {
        p_order_id: bakeryOrder,
        p_actor_staff_id: bakery.id,
        p_amount: 5,
      });
      check(Boolean(error), "Bakery cannot quote Delivery fee", error?.message);
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

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) {
    console.error("Failed:");
    for (const f of failed) console.error(` - ${f.label}: ${f.detail ?? ""}`);
    process.exit(1);
  }
  console.log("2B-1 independent authority LIVE OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
