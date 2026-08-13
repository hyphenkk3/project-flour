/**
 * Live Collection — Mark Collected authority (isolated fixtures).
 * Run: npx tsx scripts/test-collection-picked-up-live.ts
 * Never mutates Product order 7e9779ac-….
 *
 * Cleanup rule: never process.exit after fixtures exist — throw so `finally`
 * always runs, then assert zero leftovers for this SIG.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { isActiveOnBakeryBoard } from "@/workspaces/bakery/eligibility";
import {
  isActiveOnCollectionBoard,
  isCollectionMarkCollectedEligible,
} from "@/workspaces/collection/eligibility";

const PRODUCT_ORDER_ID = "7e9779ac-152b-42e0-8002-34ba8e9b11b5";
const BOARD_DATE = "2026-10-24";
const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260813140000_collection_picked_up_authority.sql",
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

const SIG = `COLL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    const { data: roles } = await admin.from("roles").select("id, code");
    const roleByCode = new Map((roles ?? []).map((r) => [r.code, r.id]));

    async function staffForRole(code: string) {
      const roleId = roleByCode.get(code);
      if (!roleId) return null;
      const { data } = await admin
        .from("staff_profiles")
        .select("id, role_id")
        .eq("role_id", roleId)
        .limit(1)
        .maybeSingle();
      return data;
    }

    const owner = await staffForRole("owner");
    const manager = await staffForRole("manager");
    const collection = await staffForRole("collection");
    const bakery = await staffForRole("bakery");
    const co = await staffForRole("customer_operations");

    if (!owner?.id) throw new Error("No owner staff_profiles row");

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
        p_actor_staff_id: owner!.id,
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
        p_internal_notes: `${SIG} ${name}`,
        p_fulfilment_method: method,
        p_delivery:
          method === "delivery"
            ? {
                recipient_name: `${SIG} Recipient`,
                recipient_phone: "0198888102",
                address_line_1: "12 Jalan Collection",
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
      orderIds.push(data.id);
      return data.id as string;
    }

    async function makeReadyPaid(id: string, status: "paid" | "awaiting_payment" = "paid") {
      await admin
        .from("orders")
        .update({
          status,
          ready_at: new Date().toISOString(),
          ready_by: owner!.id,
        })
        .eq("id", id);
    }

    async function loadOrder(id: string) {
      const { data, error } = await admin
        .from("orders")
        .select(
          "id, customer_id, pickup_date, status, fulfilment_method, ready_at, picked_up_at, production_started_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (error || !data) throw new Error(error?.message ?? "missing");
      return data;
    }

    // Migration gate: bakery/CO must be denied at RPC
    {
      const denied = bakery ?? co;
      if (denied?.id) {
        const id = await createOrder(`${SIG} Auth Probe`);
        await makeReadyPaid(id);
        const { error } = await admin.rpc("mark_guest_order_picked_up", {
          p_order_id: id,
          p_actor_staff_id: denied.id,
        });
        const msg = rpcMessage(error).toLowerCase();
        if (!error || !msg.includes("not authorized")) {
          migrationBlocked = true;
          throw new MigrationBlockedError(
            `Collection Picked Up RPC role hardening not live. Apply ${MIGRATION_PATH}. rpc=${rpcMessage(error)}`,
          );
        }
        check(
          true,
          "unauthorized role cannot Mark Collected",
          rpcMessage(error),
        );
      } else {
        pass(
          "unauthorized role cannot Mark Collected",
          "SKIP — no bakery/CO staff",
        );
      }
    }

    // Owner Mark Collected + Undo + Bakery exit/restore
    {
      const id = await createOrder(`${SIG} Owner Collect`);
      await makeReadyPaid(id);
      const before = await loadOrder(id);
      check(
        isCollectionMarkCollectedEligible({
          readyAt: before.ready_at,
          pickedUpAt: before.picked_up_at,
          fulfilmentMethod: before.fulfilment_method,
          status: before.status,
        }),
        "Owner Collect eligible while Ready",
      );
      check(
        isActiveOnCollectionBoard({
          customerId: before.customer_id,
          pickupDate: before.pickup_date,
          selectedPickupDate: BOARD_DATE,
          status: before.status,
          fulfilmentMethod: before.fulfilment_method,
          readyAt: before.ready_at,
          pickedUpAt: before.picked_up_at,
        }),
        "on Collection board before Collect",
      );
      check(
        isActiveOnBakeryBoard({
          customerId: before.customer_id,
          pickupDate: before.pickup_date,
          selectedPickupDate: BOARD_DATE,
          status: before.status,
          productionStartedAt: before.production_started_at,
          readyAt: before.ready_at,
          pickedUpAt: before.picked_up_at,
          outForDeliveryAt: null,
          fulfilmentMethod: before.fulfilment_method,
        }),
        "still on Bakery board before Collect",
      );

      const { error } = await admin.rpc("mark_guest_order_picked_up", {
        p_order_id: id,
        p_actor_staff_id: owner.id,
      });
      check(!error, "Owner Mark Collected", rpcMessage(error));
      const after = await loadOrder(id);
      check(Boolean(after.picked_up_at), "picked_up_at set");
      check(Boolean(after.ready_at), "Ready preserved after Collect");
      check(
        !isActiveOnCollectionBoard({
          customerId: after.customer_id,
          pickupDate: after.pickup_date,
          selectedPickupDate: BOARD_DATE,
          status: after.status,
          fulfilmentMethod: after.fulfilment_method,
          readyAt: after.ready_at,
          pickedUpAt: after.picked_up_at,
        }),
        "leaves Collection board after Collect",
      );
      check(
        !isActiveOnBakeryBoard({
          customerId: after.customer_id,
          pickupDate: after.pickup_date,
          selectedPickupDate: BOARD_DATE,
          status: after.status,
          productionStartedAt: after.production_started_at,
          readyAt: after.ready_at,
          pickedUpAt: after.picked_up_at,
          outForDeliveryAt: null,
          fulfilmentMethod: after.fulfilment_method,
        }),
        "Bakery exits after Collect (picked_up_at)",
      );

      const { error: dup } = await admin.rpc("mark_guest_order_picked_up", {
        p_order_id: id,
        p_actor_staff_id: owner.id,
      });
      check(
        Boolean(dup) &&
          rpcMessage(dup).toLowerCase().includes("already marked picked up"),
        "duplicate Mark Collected rejected",
        rpcMessage(dup),
      );

      const { error: undoErr } = await admin.rpc("undo_guest_order_picked_up", {
        p_order_id: id,
        p_actor_staff_id: owner.id,
      });
      check(!undoErr, "Owner Undo Collected", rpcMessage(undoErr));
      const restored = await loadOrder(id);
      check(restored.picked_up_at == null, "picked_up cleared");
      check(Boolean(restored.ready_at), "Ready preserved after Undo");
      check(
        isActiveOnBakeryBoard({
          customerId: restored.customer_id,
          pickupDate: restored.pickup_date,
          selectedPickupDate: BOARD_DATE,
          status: restored.status,
          productionStartedAt: restored.production_started_at,
          readyAt: restored.ready_at,
          pickedUpAt: restored.picked_up_at,
          outForDeliveryAt: null,
          fulfilmentMethod: restored.fulfilment_method,
        }),
        "Bakery visibility restored after Undo",
      );
      check(
        isActiveOnCollectionBoard({
          customerId: restored.customer_id,
          pickupDate: restored.pickup_date,
          selectedPickupDate: BOARD_DATE,
          status: restored.status,
          fulfilmentMethod: restored.fulfilment_method,
          readyAt: restored.ready_at,
          pickedUpAt: restored.picked_up_at,
        }),
        "returns to Collection Ready queue after Undo",
      );
    }

    if (manager?.id) {
      const id = await createOrder(`${SIG} Manager Collect`);
      await makeReadyPaid(id);
      const { error } = await admin.rpc("mark_guest_order_picked_up", {
        p_order_id: id,
        p_actor_staff_id: manager.id,
      });
      check(!error, "Manager Mark Collected", rpcMessage(error));
    } else {
      pass("Manager Mark Collected", "SKIP — no manager staff");
    }

    if (collection?.id) {
      const id = await createOrder(`${SIG} Collection Collect`);
      await makeReadyPaid(id);
      const { error } = await admin.rpc("mark_guest_order_picked_up", {
        p_order_id: id,
        p_actor_staff_id: collection.id,
      });
      check(!error, "collection role Mark Collected", rpcMessage(error));
    } else {
      pass("collection role Mark Collected", "SKIP — no collection staff");
    }

    if (co?.id) {
      const id = await createOrder(`${SIG} CO Deny`);
      await makeReadyPaid(id);
      await admin.rpc("mark_guest_order_picked_up", {
        p_order_id: id,
        p_actor_staff_id: owner.id,
      });
      const { error } = await admin.rpc("undo_guest_order_picked_up", {
        p_order_id: id,
        p_actor_staff_id: co.id,
      });
      check(
        Boolean(error) &&
          rpcMessage(error).toLowerCase().includes("not authorized"),
        "CO cannot Undo Collected",
        rpcMessage(error),
      );
    } else {
      pass("CO cannot Undo Collected", "SKIP — no CO staff");
    }

    {
      const id = await createOrder(`${SIG} Delivery Refuse`, "delivery");
      await makeReadyPaid(id);
      const { error: pickErr } = await admin.rpc("mark_guest_order_picked_up", {
        p_order_id: id,
        p_actor_staff_id: owner.id,
      });
      check(
        Boolean(pickErr) &&
          rpcMessage(pickErr).toLowerCase().includes("delivery"),
        "Delivery cannot Mark Picked Up",
        rpcMessage(pickErr),
      );
    }

    {
      const id = await createOrder(`${SIG} AP Collect`);
      await makeReadyPaid(id, "awaiting_payment");
      const { error } = await admin.rpc("mark_guest_order_picked_up", {
        p_order_id: id,
        p_actor_staff_id: owner.id,
      });
      check(!error, "AP Ready may Mark Collected", rpcMessage(error));
      const row = await loadOrder(id);
      check(row.status === "awaiting_payment", "payment status unchanged");
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
        `AUDIT leftover Collection fixtures for SIG=${SIG}: ${[...leftoverIds].join(", ")}`,
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
      "Collection Picked Up RPC role hardening not live (fixtures cleaned).",
    );
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} PASS`);
  if (failed.length) {
    for (const f of failed) console.error(`FAIL ${f.label}: ${f.detail ?? ""}`);
    process.exitCode = 1;
    return;
  }
  console.log("PASS Collection picked-up live");
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
