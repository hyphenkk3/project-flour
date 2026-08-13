/**
 * M5-P3 — live Bakery Ready authority (isolated fixtures).
 * Run: npx tsx scripts/test-m5-p3-bakery-ready-live.ts
 * Never mutates Product order 7e9779ac-….
 *
 * Cleanup rule: never process.exit after fixtures exist — throw so `finally`
 * always runs, then assert zero leftovers for this SIG.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  bakeryProductionPresentation,
  hasPaymentAttention,
  isBakeryMarkReadyEligible,
} from "@/workspaces/bakery/eligibility";
import { BAKERY_ORDER_SELECT } from "@/workspaces/bakery/select";
import type { BakeryOrderRow } from "@/workspaces/bakery/map-order";

const PRODUCT_ORDER_ID = "7e9779ac-152b-42e0-8002-34ba8e9b11b5";
const BOARD_DATE = "2026-10-23";
const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260813120000_m5_p3_bakery_ready_authority.sql",
);

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

const SIG = `M5P3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    return;
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
  let migrationBlocked = false;

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

    async function createOrder(
      name: string,
      method: "pickup" | "delivery" = "pickup",
    ): Promise<string> {
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
        p_internal_notes: `${SIG}-bakery-ready`,
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

    // Migration gate: CO/Collection Ready must be denied
    if (deniedStaff?.id) {
      const id = await createOrder(`${SIG} Auth Probe`);
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      const { error } = await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: deniedStaff.id,
      });
      const msg = rpcMessage(error).toLowerCase();
      if (!error || !msg.includes("not authorized")) {
        migrationBlocked = true;
        throw new MigrationBlockedError(
          `M5-P3 Ready RPC role hardening not live. Apply ${MIGRATION_PATH}. rpc=${rpcMessage(error)}`,
        );
      }
      check(true, "unauthorized role cannot Mark Ready", rpcMessage(error));
    } else {
      pass("unauthorized role cannot Mark Ready", "SKIP — no CO/collection staff");
    }

    // Owner Ready-without-Start preserved (RPC Start-agnostic)
    {
      const id = await createOrder(`${SIG} Owner Skip`);
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      const { error } = await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(!error, "Owner Ready without Start", rpcMessage(error));
      const row = await loadRow(id);
      check(row.production_started_at == null, "does not fabricate Start");
      check(
        bakeryProductionPresentation({
          productionStartedAt: row.production_started_at,
          readyAt: row.ready_at,
        }) === "ready",
        "Ready presentation",
      );

      const { error: undoErr } = await admin.rpc("undo_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(!undoErr, "Undo Ready after Owner skip-Start", rpcMessage(undoErr));
      const after = await loadRow(id);
      check(after.ready_at == null, "Ready cleared");
      check(after.production_started_at == null, "Start still null after Undo");
      check(
        bakeryProductionPresentation({
          productionStartedAt: after.production_started_at,
          readyAt: after.ready_at,
        }) === "not_started",
        "returns to Not started",
      );
    }

    // Start → Ready → Undo Ready → In Production
    {
      const id = await createOrder(`${SIG} Start Ready`);
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      await admin.rpc("mark_guest_order_production_started", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      const started = await loadRow(id);
      check(
        isBakeryMarkReadyEligible({
          productionStartedAt: started.production_started_at,
          readyAt: started.ready_at,
          status: started.status,
        }),
        "Bakery Mark Ready eligible after Start",
      );
      const { error: readyErr } = await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(!readyErr, "Mark Ready after Start", rpcMessage(readyErr));
      const ready = await loadRow(id);
      check(
        ready.production_started_at === started.production_started_at,
        "Ready preserves Start",
      );
      check(
        bakeryProductionPresentation({
          productionStartedAt: ready.production_started_at,
          readyAt: ready.ready_at,
        }) === "ready",
        "Ready presentation",
      );

      const { error: undoErr } = await admin.rpc("undo_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(!undoErr, "Undo Ready after Start+Ready", rpcMessage(undoErr));
      const undone = await loadRow(id);
      check(
        undone.production_started_at === started.production_started_at,
        "Undo Ready preserves Start",
      );
      check(undone.ready_at == null, "Ready cleared");
      check(
        bakeryProductionPresentation({
          productionStartedAt: undone.production_started_at,
          readyAt: undone.ready_at,
        }) === "in_production",
        "returns to In Production",
      );
    }

    // AP In Production → Ready + Payment Attention
    {
      const id = await createOrder(`${SIG} AP Ready`);
      await admin
        .from("orders")
        .update({ status: "awaiting_payment" })
        .eq("id", id);
      await admin.rpc("mark_guest_order_production_started", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      const { error } = await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(!error, "AP In Production may Mark Ready", rpcMessage(error));
      const row = await loadRow(id);
      check(
        hasPaymentAttention({
          productionStartedAt: row.production_started_at,
          readyAt: row.ready_at,
          status: row.status,
        }),
        "Ready + AP has Payment Attention",
      );
    }

    // Terminal Undo Ready rejected
    {
      const id = await createOrder(`${SIG} Terminal Mark`);
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      await admin.rpc("mark_guest_order_picked_up", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      const { error: undoReady } = await admin.rpc("undo_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(
        Boolean(undoReady) &&
          rpcMessage(undoReady).toLowerCase().includes("picked up"),
        "Undo Ready blocked after Picked Up",
        rpcMessage(undoReady),
      );
    }

    // Mark Ready rejected after Out for Delivery (terminal race on Mark)
    {
      const id = await createOrder(`${SIG} Out Mark`, "delivery");
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      await admin.rpc("mark_guest_order_out_for_delivery", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      const { error } = await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(
        Boolean(error) &&
          rpcMessage(error).toLowerCase().includes("left bakery"),
        "Mark Ready rejected after Out for Delivery",
        rpcMessage(error),
      );
    }

    // Unauthorized Undo Ready
    if (deniedStaff?.id) {
      const id = await createOrder(`${SIG} Denied Undo`);
      await admin.from("orders").update({ status: "paid" }).eq("id", id);
      await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      const { error } = await admin.rpc("undo_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: deniedStaff.id,
      });
      check(
        Boolean(error) &&
          rpcMessage(error).toLowerCase().includes("not authorized"),
        "unauthorized role cannot Undo Ready",
        rpcMessage(error),
      );
    } else {
      pass("unauthorized role cannot Undo Ready", "SKIP — no CO/collection staff");
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
      .select("id, guest_name")
      .like("guest_name", `${SIG}%`);
    const { data: leftoverByNotes } = await admin
      .from("orders")
      .select("id, internal_notes")
      .like("internal_notes", `${SIG}%`);
    for (const row of [...(leftoverByName ?? []), ...(leftoverByNotes ?? [])]) {
      leftoverIds.add(row.id);
    }
    leftoverIds.delete(PRODUCT_ORDER_ID);
    if (leftoverIds.size > 0) {
      cleanupFailures.push(
        `AUDIT leftover M5-P3 fixtures for SIG=${SIG}: ${[...leftoverIds].join(", ")}`,
      );
    }

    if (cleanupFailures.length > 0) {
      for (const message of cleanupFailures) fail("fixture cleanup", message);
    } else if (orderIds.length > 0) {
      pass("fixture cleanup removed this run's SIG orders");
    }
  }

  if (migrationBlocked) {
    throw new MigrationBlockedError(
      "M5-P3 Ready RPC role hardening not live (fixtures cleaned).",
    );
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} PASS`);
  if (failed.length) {
    for (const f of failed) console.error(`FAIL ${f.label}: ${f.detail ?? ""}`);
    process.exitCode = 1;
    return;
  }
  console.log("PASS M5-P3 bakery ready live");
}

main().catch((err) => {
  if (err instanceof MigrationBlockedError) {
    console.error("BLOCKED:", err.message);
    process.exitCode = 2;
    return;
  }
  console.error(err);
  process.exitCode = 1;
});
