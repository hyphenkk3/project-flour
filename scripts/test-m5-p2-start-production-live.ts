/**
 * M5-P2 — live Start Production RPCs + board retention (isolated fixtures).
 *
 * Run: npx tsx scripts/test-m5-p2-start-production-live.ts
 *
 * Never mutates Product order 7e9779ac-….
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  bakeryProductionPresentation,
  hasPaymentAttention,
  isActiveOnBakeryBoard,
} from "@/workspaces/bakery/eligibility";
import { BAKERY_ORDER_SELECT } from "@/workspaces/bakery/select";
import type { BakeryOrderRow } from "@/workspaces/bakery/map-order";

const PRODUCT_ORDER_ID = "7e9779ac-152b-42e0-8002-34ba8e9b11b5";
const BOARD_DATE = "2026-10-22";
const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260812213000_m5_p2_start_production.sql",
);

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

const SIG = `M5P2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
console.log(`fixture signature SIG=${SIG}`);

type Check = { label: string; ok: boolean; detail?: string };

function rpcMessage(error: { message?: string } | null | undefined): string {
  return error?.message ?? "";
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log("SKIP live DB (missing Supabase env).");
    process.exit(0);
  }

  const migrationHash = createHash("sha256")
    .update(readFileSync(MIGRATION_PATH))
    .digest("hex");
  console.log(`migration sha256=${migrationHash}`);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const checks: Check[] = [];
  const orderIds: string[] = [];

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

  const { data: probe, error: probeError } = await admin
    .from("orders")
    .select("id, production_started_at, production_started_by")
    .limit(1);
  if (probeError) {
    console.error(
      "BLOCKED: production_started_* columns missing. Apply supabase/migrations/20260812213000_m5_p2_start_production.sql",
      probeError.message,
    );
    process.exit(2);
  }
  void probe;

  try {
    const { data: staff } = await admin
      .from("staff_profiles")
      .select("id, role_id")
      .limit(1)
      .maybeSingle();
    if (!staff?.id) throw new Error("No staff_profiles row");

    const { data: roles } = await admin.from("roles").select("id, code");
    const roleById = new Map((roles ?? []).map((r) => [r.id, r.code]));
    const actorRole = roleById.get(staff.role_id) ?? "unknown";
    check(
      actorRole === "owner" || actorRole === "manager" || actorRole === "bakery",
      "fixture actor is production-capable",
      actorRole,
    );

    const deniedRoleIds = (roles ?? [])
      .filter((r) => r.code === "customer_operations" || r.code === "collection")
      .map((r) => r.id);
    const { data: deniedStaff } =
      deniedRoleIds.length > 0
        ? await admin
            .from("staff_profiles")
            .select("id, role_id")
            .in("role_id", deniedRoleIds)
            .limit(1)
            .maybeSingle()
        : { data: null };

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

    async function createOrder(name: string, method: "pickup" | "delivery" = "pickup") {
      const { data, error } = await admin.rpc("create_staff_guest_preorder", {
        p_actor_staff_id: staff!.id,
        p_customer_name: name,
        p_phone: "0177005101",
        p_email: null,
        p_order_source: "whatsapp",
        p_crew_order: false,
        p_pickup_date: BOARD_DATE,
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
        p_internal_notes: `${SIG}-start-production`,
        p_fulfilment_method: method,
        p_delivery:
          method === "delivery"
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

    async function loadRow(id: string): Promise<BakeryOrderRow> {
      const { data, error } = await admin
        .from("orders")
        .select(BAKERY_ORDER_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error || !data) throw new Error(error?.message ?? "missing row");
      return data as BakeryOrderRow;
    }

    // Submitted cannot Start
    {
      const id = await createOrder(`${SIG} Submitted`);
      await admin.from("orders").update({ status: "submitted" }).eq("id", id);
      const { error } = await admin.rpc("mark_guest_order_production_started", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(
        Boolean(error) && rpcMessage(error).includes("cannot be started"),
        "Submitted cannot Start",
        rpcMessage(error),
      );
    }

    // Pending Confirmation cannot Start
    {
      const id = await createOrder(`${SIG} Pending`);
      await admin
        .from("orders")
        .update({ status: "pending_confirmation" })
        .eq("id", id);
      const { error } = await admin.rpc("mark_guest_order_production_started", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(
        Boolean(error) && rpcMessage(error).includes("cannot be started"),
        "Pending Confirmation cannot Start",
        rpcMessage(error),
      );
    }

    // Awaiting Payment Start + Payment Attention + Undo + restart
    {
      const id = await createOrder(`${SIG} Awaiting`);
      await admin
        .from("orders")
        .update({ status: "awaiting_payment" })
        .eq("id", id);
      const { error: startErr } = await admin.rpc(
        "mark_guest_order_production_started",
        { p_order_id: id, p_actor_staff_id: staff.id },
      );
      check(!startErr, "Awaiting Payment Start", rpcMessage(startErr));
      let row = await loadRow(id);
      check(Boolean(row.production_started_at), "Start timestamp persisted");
      check(row.production_started_by === staff.id, "Start actor attribution");
      check(
        bakeryProductionPresentation({
          productionStartedAt: row.production_started_at,
          readyAt: row.ready_at,
        }) === "in_production",
        "Awaiting Payment presents In Production",
      );
      check(
        hasPaymentAttention({
          productionStartedAt: row.production_started_at,
          readyAt: row.ready_at,
          status: row.status,
        }),
        "Started + unpaid Payment Attention",
      );

      const { data: events } = await admin
        .from("order_timeline_events")
        .select("event_type, actor_staff_id")
        .eq("order_id", id)
        .eq("event_type", "order_production_started");
      check(
        (events ?? []).some((e) => e.actor_staff_id === staff.id),
        "Start timeline event",
      );

      const { error: dupErr } = await admin.rpc(
        "mark_guest_order_production_started",
        { p_order_id: id, p_actor_staff_id: staff.id },
      );
      check(
        Boolean(dupErr) && rpcMessage(dupErr).includes("already in production"),
        "duplicate Start rejected",
        rpcMessage(dupErr),
      );

      const { error: undoErr } = await admin.rpc(
        "undo_guest_order_production_started",
        { p_order_id: id, p_actor_staff_id: staff.id },
      );
      check(!undoErr, "Undo Start", rpcMessage(undoErr));
      row = await loadRow(id);
      check(
        row.production_started_at == null && row.production_started_by == null,
        "Undo Start clears timestamp/actor",
      );

      const { error: restartErr } = await admin.rpc(
        "mark_guest_order_production_started",
        { p_order_id: id, p_actor_staff_id: staff.id },
      );
      check(!restartErr, "restart after Undo", rpcMessage(restartErr));
    }

    // Paid Start — no payment attention
    {
      const id = await createOrder(`${SIG} Paid`);
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      const { error } = await admin.rpc("mark_guest_order_production_started", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(!error, "Paid Start", rpcMessage(error));
      const row = await loadRow(id);
      check(
        !hasPaymentAttention({
          productionStartedAt: row.production_started_at,
          readyAt: row.ready_at,
          status: row.status,
        }),
        "Paid Start has no Payment Attention",
      );
    }

    // Owner Ready skip Start — no fabricated Start; Ready wins
    {
      const id = await createOrder(`${SIG} Ready Skip`);
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      const { error } = await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(!error, "Owner Ready without Start", rpcMessage(error));
      const row = await loadRow(id);
      check(row.production_started_at == null, "Ready does not fabricate Start");
      check(
        bakeryProductionPresentation({
          productionStartedAt: row.production_started_at,
          readyAt: row.ready_at,
        }) === "ready",
        "Ready presentation without Start",
      );
    }

    // Start then Ready preserves Start; Undo Start blocked
    {
      const id = await createOrder(`${SIG} Start Then Ready`);
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      await admin.rpc("mark_guest_order_production_started", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      const before = await loadRow(id);
      await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      const after = await loadRow(id);
      check(
        after.production_started_at === before.production_started_at,
        "Ready preserves Start",
      );
      check(
        bakeryProductionPresentation({
          productionStartedAt: after.production_started_at,
          readyAt: after.ready_at,
        }) === "ready",
        "Ready wins over Start",
      );
      const { error: undoErr } = await admin.rpc(
        "undo_guest_order_production_started",
        { p_order_id: id, p_actor_staff_id: staff.id },
      );
      check(
        Boolean(undoErr) && rpcMessage(undoErr).includes("while the order is ready"),
        "Undo Start blocked after Ready",
        rpcMessage(undoErr),
      );
    }

    // Q13 demotion: Started then awaiting_payment remains + Payment Attention
    {
      const id = await createOrder(`${SIG} Demote`);
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      await admin.rpc("mark_guest_order_production_started", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      const started = await loadRow(id);
      await admin
        .from("orders")
        .update({ status: "awaiting_payment" })
        .eq("id", id);
      const demoted = await loadRow(id);
      check(
        demoted.production_started_at === started.production_started_at,
        "financial demotion does not clear Start",
      );
      check(
        isActiveOnBakeryBoard({
          customerId: demoted.customer_id,
          pickupDate: demoted.pickup_date,
          selectedPickupDate: BOARD_DATE,
          status: demoted.status,
          productionStartedAt: demoted.production_started_at,
          readyAt: demoted.ready_at,
          pickedUpAt: demoted.picked_up_at,
          outForDeliveryAt: demoted.out_for_delivery_at,
          fulfilmentMethod: demoted.fulfilment_method,
        }),
        "Started demoted order remains on board",
      );
      check(
        hasPaymentAttention({
          productionStartedAt: demoted.production_started_at,
          readyAt: demoted.ready_at,
          status: demoted.status,
        }),
        "demoted Started order has Payment Attention",
      );
      const { error: undoErr } = await admin.rpc(
        "undo_guest_order_production_started",
        { p_order_id: id, p_actor_staff_id: staff.id },
      );
      check(!undoErr, "Undo Start still allowed after demotion", rpcMessage(undoErr));
    }

    // Terminal: Picked Up cannot Start
    {
      const id = await createOrder(`${SIG} Picked`);
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      await admin.rpc("mark_guest_order_picked_up", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      const { error } = await admin.rpc("mark_guest_order_production_started", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(
        Boolean(error),
        "Picked Up cannot Start",
        rpcMessage(error),
      );
      const row = await loadRow(id);
      check(
        !isActiveOnBakeryBoard({
          customerId: row.customer_id,
          pickupDate: row.pickup_date,
          selectedPickupDate: BOARD_DATE,
          status: row.status,
          productionStartedAt: row.production_started_at,
          readyAt: row.ready_at,
          pickedUpAt: row.picked_up_at,
          outForDeliveryAt: row.out_for_delivery_at,
          fulfilmentMethod: row.fulfilment_method,
        }),
        "Pickup Picked Up excluded from board",
      );
    }

    // Member denial
    {
      const id = await createOrder(`${SIG} Memberish`);
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      const { data: customer } = await admin
        .from("customers")
        .insert({
          full_name: `${SIG} Member`,
          phone_number: `017${String(Date.now()).slice(-8)}`,
        })
        .select("id")
        .maybeSingle();
      if (customer?.id) {
        await admin
          .from("orders")
          .update({ customer_id: customer.id })
          .eq("id", id);
        const { error } = await admin.rpc("mark_guest_order_production_started", {
          p_order_id: id,
          p_actor_staff_id: staff.id,
        });
        check(
          Boolean(error) && rpcMessage(error).toLowerCase().includes("not found"),
          "member order cannot Start",
          rpcMessage(error),
        );
        await admin.from("orders").update({ customer_id: null }).eq("id", id);
        await admin.from("customers").delete().eq("id", customer.id);
      } else {
        pass("member order cannot Start", "SKIP — no customers fixture");
      }
    }

    // Unauthorized role
    if (deniedStaff?.id) {
      const id = await createOrder(`${SIG} Denied Role`);
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      const { error } = await admin.rpc("mark_guest_order_production_started", {
        p_order_id: id,
        p_actor_staff_id: deniedStaff.id,
      });
      check(
        Boolean(error) && rpcMessage(error).toLowerCase().includes("not authorized"),
        "unauthorized role cannot Start",
        rpcMessage(error),
      );
    } else {
      pass("unauthorized role cannot Start", "SKIP — no CO/collection staff");
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
        `AUDIT leftover M5-P2 fixtures: ${[...leftoverIds].join(", ")}`,
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
