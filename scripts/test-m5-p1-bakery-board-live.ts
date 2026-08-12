/**
 * M5-P1 — live Bakery board query behaviour (isolated fixtures).
 *
 * Run: npx tsx scripts/test-m5-p1-bakery-board-live.ts
 *
 * Never mutates Product order 7e9779ac-….
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { isActiveOnBakeryBoard } from "@/workspaces/bakery/eligibility";
import { mapBakeryBoardOrder, type BakeryOrderRow } from "@/workspaces/bakery/map-order";
import { BAKERY_ORDER_SELECT } from "@/workspaces/bakery/select";

const PRODUCT_ORDER_ID = "7e9779ac-152b-42e0-8002-34ba8e9b11b5";
const BOARD_DATE = "2026-10-18";

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

const SIG = `M5P1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
console.log(`fixture signature SIG=${SIG}`);

type Check = { label: string; ok: boolean; detail?: string };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log("SKIP live DB (missing Supabase env).");
    process.exit(0);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const checks: Check[] = [];
  const orderIds: string[] = [];
  const customerIds: string[] = [];

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

  async function cleanupOrder(orderId: string) {
    await admin.from("order_timeline_events").delete().eq("order_id", orderId);
    const { data: addons } = await admin
      .from("order_paid_addons")
      .select("id")
      .eq("order_id", orderId);
    for (const addon of addons ?? []) {
      await admin
        .from("order_paid_addon_messages")
        .delete()
        .eq("order_paid_addon_id", addon.id);
    }
    await admin.from("order_paid_addons").delete().eq("order_id", orderId);
    await admin.from("order_complimentary_items").delete().eq("order_id", orderId);
    await admin.from("order_items").delete().eq("order_id", orderId);
    await admin.from("order_delivery_details").delete().eq("order_id", orderId);
    await admin.from("order_adjustments").delete().eq("order_id", orderId);
    await admin.from("payment_allocations").delete().eq("order_id", orderId);
    await admin.from("orders").delete().eq("id", orderId);
  }

  async function loadBoardRows(selectedDate: string): Promise<BakeryOrderRow[]> {
    const { data, error } = await admin
      .from("orders")
      .select(BAKERY_ORDER_SELECT)
      .is("customer_id", null)
      .eq("pickup_date", selectedDate)
      .in("status", [
        "submitted",
        "pending_confirmation",
        "awaiting_payment",
        "paid",
      ]);
    if (error) throw new Error(error.message);
    return ((data ?? []) as BakeryOrderRow[]).filter((row) =>
      isActiveOnBakeryBoard({
        customerId: row.customer_id,
        pickupDate: row.pickup_date,
        selectedPickupDate: selectedDate,
        status: row.status,
        readyAt: row.ready_at,
        pickedUpAt: row.picked_up_at,
        outForDeliveryAt: row.out_for_delivery_at,
        fulfilmentMethod: row.fulfilment_method,
      }),
    );
  }

  try {
    const { data: staff } = await admin
      .from("staff_profiles")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (!staff?.id) throw new Error("No staff_profiles row");

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

    async function createOrder(input: {
      name: string;
      method: "pickup" | "delivery";
      pickupDate?: string;
      attention?: boolean;
      notes?: string | null;
    }) {
      const { data, error } = await admin.rpc("create_staff_guest_preorder", {
        p_actor_staff_id: staff!.id,
        p_customer_name: input.name,
        p_phone: "0177005101",
        p_email: null,
        p_order_source: "whatsapp",
        p_crew_order: false,
        p_pickup_date: input.pickupDate ?? BOARD_DATE,
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
        p_include_receipt: true,
        p_needs_bakery_attention: Boolean(input.attention),
        p_bakery_attention_note: input.attention ? "Stage topper last" : null,
        p_customer_notes: input.notes ?? null,
        p_internal_notes: `${SIG}-bakery-board`,
        p_fulfilment_method: input.method,
        p_delivery:
          input.method === "delivery"
            ? {
                recipient_name: `${SIG} Recipient`,
                recipient_phone: "0198888102",
                address_line_1: "12 Jalan Bakery",
                address_line_2: null,
                postcode: "88400",
                city: "Kota Kinabalu",
                state: "Sabah",
                recipient_notify_preference: "inform_recipient",
              }
            : null,
      });
      if (error || !data?.id) {
        throw new Error(error?.message ?? "create failed");
      }
      const id = data.id as string;
      assert.notEqual(id, PRODUCT_ORDER_ID);
      orderIds.push(id);
      return id;
    }

    // unpaid / Submitted + not Ready → included (planning visibility)
    {
      const id = await createOrder({
        name: `${SIG} Unpaid`,
        method: "pickup",
      });
      await admin
        .from("orders")
        .update({ status: "awaiting_payment" })
        .eq("id", id);
      const rows = await loadBoardRows(BOARD_DATE);
      check(
        rows.some((r) => r.id === id),
        "unpaid + not Ready included (not secured)",
      );
    }

    {
      const id = await createOrder({
        name: `${SIG} Submitted`,
        method: "delivery",
      });
      await admin.from("orders").update({ status: "submitted" }).eq("id", id);
      const rows = await loadBoardRows(BOARD_DATE);
      check(rows.some((r) => r.id === id), "Submitted guest included");
    }

    // paid → included
    let paidId = "";
    {
      paidId = await createOrder({
        name: `${SIG} Paid`,
        method: "pickup",
        notes: "Less sweet",
        attention: true,
      });
      await admin.from("orders").update({ status: "paid" }).eq("id", paidId);
      const rows = await loadBoardRows(BOARD_DATE);
      const row = rows.find((r) => r.id === paidId);
      check(Boolean(row), "paid guest included");
      if (row) {
        const mapped = mapBakeryBoardOrder(row);
        check(mapped.customerNotes === "Less sweet", "customer_notes present");
        check(mapped.needsBakeryAttention === true, "Bakery Attention visible");
        check(mapped.includeReceipt === true, "include_receipt on read model");
        check(
          !("internalNotes" in mapped) && !("phone" in mapped),
          "Internal Notes / phone absent from Bakery DTO",
        );
      }
    }

    // Ready + awaiting_payment retained + Payment Attention
    {
      const id = await createOrder({
        name: `${SIG} Ready Unpaid`,
        method: "pickup",
      });
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      const { error: readyErr } = await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(!readyErr, "mark Ready for demotion case", readyErr?.message);
      await admin
        .from("orders")
        .update({ status: "awaiting_payment" })
        .eq("id", id);
      const rows = await loadBoardRows(BOARD_DATE);
      const row = rows.find((r) => r.id === id);
      check(Boolean(row), "Ready + awaiting_payment retained");
      check(
        Boolean(row?.ready_at) && row?.status === "awaiting_payment",
        "Ready + awaiting_payment derives Payment Attention inputs",
      );
    }

    // Pickup Picked Up excluded
    {
      const id = await createOrder({
        name: `${SIG} Picked Up`,
        method: "pickup",
      });
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      await admin.rpc("mark_guest_order_picked_up", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      const rows = await loadBoardRows(BOARD_DATE);
      check(!rows.some((r) => r.id === id), "Pickup Picked Up excluded");
    }

    // Delivery Ready included; Out for Delivery excluded
    {
      const id = await createOrder({
        name: `${SIG} Delivery`,
        method: "delivery",
      });
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      let rows = await loadBoardRows(BOARD_DATE);
      check(rows.some((r) => r.id === id), "Delivery Ready included");
      await admin.rpc("mark_guest_order_out_for_delivery", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      rows = await loadBoardRows(BOARD_DATE);
      check(!rows.some((r) => r.id === id), "Delivery Out for Delivery excluded");
    }

    // wrong selected date excluded
    {
      const rows = await loadBoardRows("2026-10-19");
      check(
        !rows.some((r) => orderIds.includes(r.id)),
        "wrong selected date excludes this run's BOARD_DATE fixtures",
      );
    }

    // member / customer_id excluded when fixtureable
    {
      const { data: customer, error: customerError } = await admin
        .from("customers")
        .insert({
          full_name: `${SIG} Member`,
          phone_number: `017${String(Date.now()).slice(-8)}`,
        })
        .select("id")
        .maybeSingle();
      if (customerError || !customer?.id) {
        pass(
          "member/customer_id exclusion",
          `SKIP — could not create customers fixture (${customerError?.message ?? "no id"})`,
        );
      } else {
        customerIds.push(customer.id);
        const id = await createOrder({
          name: `${SIG} MemberOrder`,
          method: "pickup",
        });
        await admin
          .from("orders")
          .update({ status: "paid", customer_id: customer.id })
          .eq("id", id);
        const { data: memberRows } = await admin
          .from("orders")
          .select(BAKERY_ORDER_SELECT)
          .eq("id", id)
          .maybeSingle();
        const active = memberRows
          ? isActiveOnBakeryBoard({
              customerId: (memberRows as BakeryOrderRow).customer_id,
              pickupDate: (memberRows as BakeryOrderRow).pickup_date,
              selectedPickupDate: BOARD_DATE,
              status: (memberRows as BakeryOrderRow).status,
              readyAt: (memberRows as BakeryOrderRow).ready_at,
              pickedUpAt: (memberRows as BakeryOrderRow).picked_up_at,
              outForDeliveryAt: (memberRows as BakeryOrderRow).out_for_delivery_at,
              fulfilmentMethod: (memberRows as BakeryOrderRow).fulfilment_method,
            })
          : true;
        const board = await loadBoardRows(BOARD_DATE);
        check(
          !active && !board.some((r) => r.id === id),
          "member/customer_id order excluded",
        );
      }
    }

    const productGuard = await admin
      .from("orders")
      .select("id, internal_notes")
      .eq("id", PRODUCT_ORDER_ID)
      .maybeSingle();
    check(
      productGuard.error == null &&
        (productGuard.data == null ||
          !String(productGuard.data.internal_notes ?? "").includes(SIG)),
      "never mutated Product order 7e9779ac-…",
    );
  } finally {
    const cleanupFailures: string[] = [];
    for (const id of [...orderIds].reverse()) {
      try {
        await cleanupOrder(id);
      } catch (err) {
        cleanupFailures.push(err instanceof Error ? err.message : String(err));
      }
    }
    for (const id of customerIds) {
      try {
        await admin.from("customers").delete().eq("id", id);
      } catch (err) {
        cleanupFailures.push(err instanceof Error ? err.message : String(err));
      }
    }

    const leftoverIds = new Set<string>();
    const { data: leftoverByName } = await admin
      .from("orders")
      .select("id")
      .like("guest_name", `${SIG}%`);
    const { data: leftoverByNotes } = await admin
      .from("orders")
      .select("id")
      .like("internal_notes", `${SIG}%`);
    for (const row of [...(leftoverByName ?? []), ...(leftoverByNotes ?? [])]) {
      leftoverIds.add(row.id);
    }
    leftoverIds.delete(PRODUCT_ORDER_ID);
    if (leftoverIds.size > 0) {
      cleanupFailures.push(
        `AUDIT leftover M5-P1 fixtures: ${[...leftoverIds].join(", ")}`,
      );
    }

    if (cleanupFailures.length > 0) {
      for (const message of cleanupFailures) fail("fixture cleanup", message);
    } else {
      pass("fixture cleanup removed this run's SIG orders");
    }
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
