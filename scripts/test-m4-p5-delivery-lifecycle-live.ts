/**
 * M4-P5 — live Delivery operational lifecycle (schema + RPCs + skip/undo).
 *
 * Prerequisites:
 *   apply 20260812140000_m4_p5_delivery_operational_lifecycle.sql
 *   approved SHA-256 b3c2228294f1d1a59f113d3a13b412dbb64e5c63ec7cc86d59162b274ab60931
 *
 * Run: npx tsx scripts/test-m4-p5-delivery-lifecycle-live.ts
 *
 * Isolated fixtures only. Never mutates Product order 7e9779ac-….
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPROVED_MIGRATION_SHA256 =
  "b3c2228294f1d1a59f113d3a13b412dbb64e5c63ec7cc86d59162b274ab60931";
const PRODUCT_ORDER_ID = "7e9779ac-152b-42e0-8002-34ba8e9b11b5";
const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260812140000_m4_p5_delivery_operational_lifecycle.sql",
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

const SIG = `M4P5-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
console.log(`fixture signature SIG=${SIG}`);

type Check = { label: string; ok: boolean; detail?: string };
type LifecycleRow = {
  id: string;
  fulfilment_method: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  out_for_delivery_at: string | null;
  delivered_at: string | null;
};

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
  if (migrationHash !== APPROVED_MIGRATION_SHA256) {
    console.error("BLOCKED: migration file hash does not match approved contract.");
    process.exit(2);
  }

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

  async function loadLifecycle(orderId: string): Promise<LifecycleRow> {
    const { data, error } = await admin
      .from("orders")
      .select(
        "id, fulfilment_method, ready_at, picked_up_at, out_for_delivery_at, delivered_at",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Order ${orderId} not found`);
    return data as LifecycleRow;
  }

  async function cleanupOrder(orderId: string) {
    if (orderId === PRODUCT_ORDER_ID) {
      throw new Error("Refusing to cleanup Product order 7e9779ac-…");
    }
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
          `P5 fixture cleanup failed (${step.label}) for ${orderId}: ${error.message}`,
        );
      }
    }
  }

  try {
    const { error: colErr } = await admin
      .from("orders")
      .select(
        "out_for_delivery_at, out_for_delivery_by, delivered_at, delivered_by",
      )
      .limit(1);
    if (colErr) {
      throw new Error(
        `BLOCKED: Delivery lifecycle columns missing. ${colErr.message}`,
      );
    }
    pass("columns out_for_delivery_at/by + delivered_at/by exist");

    const { data: staff, error: staffErr } = await admin
      .from("staff_profiles")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (staffErr || !staff?.id) throw new Error("No staff_profiles");

    const missingOrderProbe = await admin.rpc("mark_guest_order_out_for_delivery", {
      p_order_id: "00000000-0000-0000-0000-000000000001",
      p_actor_staff_id: staff.id,
    });
    const missingMsg = rpcMessage(missingOrderProbe.error);
    if (/could not find the function|schema cache/i.test(missingMsg)) {
      throw new Error(
        `BLOCKED: mark_guest_order_out_for_delivery missing. ${missingMsg}`,
      );
    }
    check(
      /order not found/i.test(missingMsg),
      "RPC mark_guest_order_out_for_delivery exists",
      missingMsg,
    );

    for (const name of [
      "undo_guest_order_out_for_delivery",
      "mark_guest_order_delivered",
      "undo_guest_order_delivered",
    ] as const) {
      const probe = await admin.rpc(name, {
        p_order_id: "00000000-0000-0000-0000-000000000001",
        p_actor_staff_id: staff.id,
      });
      const msg = rpcMessage(probe.error);
      if (/could not find the function|schema cache/i.test(msg)) {
        throw new Error(`BLOCKED: ${name} missing. ${msg}`);
      }
      check(/order not found/i.test(msg), `RPC ${name} exists`, msg);
    }

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
    }) {
      const { data, error } = await admin.rpc("create_staff_guest_preorder", {
        p_actor_staff_id: staff!.id,
        p_customer_name: input.name,
        p_phone: "0177005001",
        p_email: null,
        p_order_source: "whatsapp",
        p_crew_order: false,
        p_pickup_date: "2026-09-20",
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
        p_delivery:
          input.method === "delivery"
            ? {
                recipient_name: `${SIG} Recipient`,
                recipient_phone: "0198888002",
                address_line_1: "12 Jalan Lifecycle",
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
      console.log(`created fixture ${id} ${input.name}`);
      return id;
    }

    // A. Out may skip Ready; skipped ready_at stays null
    {
      const id = await createOrder({ name: `${SIG} Skip Ready`, method: "delivery" });
      const { error } = await admin.rpc("mark_guest_order_out_for_delivery", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(!error, "A mark Out for Delivery without Ready", error?.message);
      const row = await loadLifecycle(id);
      check(row.out_for_delivery_at != null, "A out_for_delivery_at set");
      check(row.ready_at == null, "A skipped ready_at remains null");
      check(row.delivered_at == null, "A delivered_at still null");
      check(row.picked_up_at == null, "A picked_up_at not fabricated");
    }

    // B. Undo Out; then Delivered may skip Out
    {
      const id = await createOrder({ name: `${SIG} Undo Out`, method: "delivery" });
      await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      await admin.rpc("mark_guest_order_out_for_delivery", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      const { error: undoOutErr } = await admin.rpc(
        "undo_guest_order_out_for_delivery",
        { p_order_id: id, p_actor_staff_id: staff.id },
      );
      check(!undoOutErr, "B undo Out for Delivery", undoOutErr?.message);
      const afterUndo = await loadLifecycle(id);
      check(afterUndo.out_for_delivery_at == null, "B out cleared");
      check(afterUndo.ready_at != null, "B Ready preserved after undo Out");

      const { error: deliverErr } = await admin.rpc("mark_guest_order_delivered", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(!deliverErr, "B mark Delivered without Out", deliverErr?.message);
      const delivered = await loadLifecycle(id);
      check(delivered.delivered_at != null, "B delivered_at set");
      check(
        delivered.out_for_delivery_at == null,
        "B skipped out_for_delivery_at remains null",
      );
      check(delivered.ready_at != null, "B Ready preserved when Delivered skips Out");
    }

    // C. Undo Delivered preserves Out + Ready
    {
      const id = await createOrder({
        name: `${SIG} Undo Delivered`,
        method: "delivery",
      });
      await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      await admin.rpc("mark_guest_order_out_for_delivery", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      await admin.rpc("mark_guest_order_delivered", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      const beforeUndo = await loadLifecycle(id);
      const { error } = await admin.rpc("undo_guest_order_delivered", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(!error, "C undo Delivered", error?.message);
      const after = await loadLifecycle(id);
      check(after.delivered_at == null, "C delivered_at cleared");
      check(
        after.out_for_delivery_at === beforeUndo.out_for_delivery_at,
        "C Out preserved",
      );
      check(after.ready_at === beforeUndo.ready_at, "C Ready preserved");
    }

    // D. Undo Ready blocked while Out / Delivered
    {
      const id = await createOrder({
        name: `${SIG} Block Undo Ready`,
        method: "delivery",
      });
      await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      await admin.rpc("mark_guest_order_out_for_delivery", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      const { error: whileOut } = await admin.rpc("undo_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(
        /out for delivery/i.test(rpcMessage(whileOut)),
        "D undo Ready blocked while Out",
        rpcMessage(whileOut),
      );

      await admin.rpc("mark_guest_order_delivered", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      const { error: whileOutAndDelivered } = await admin.rpc(
        "undo_guest_order_ready",
        { p_order_id: id, p_actor_staff_id: staff.id },
      );
      check(
        /out for delivery|delivered/i.test(rpcMessage(whileOutAndDelivered)),
        "D undo Ready still blocked after Delivered (Out still set)",
        rpcMessage(whileOutAndDelivered),
      );

      const deliveredOnly = await createOrder({
        name: `${SIG} Block Undo Ready Delivered Only`,
        method: "delivery",
      });
      await admin.rpc("mark_guest_order_ready", {
        p_order_id: deliveredOnly,
        p_actor_staff_id: staff.id,
      });
      await admin.rpc("mark_guest_order_delivered", {
        p_order_id: deliveredOnly,
        p_actor_staff_id: staff.id,
      });
      const { error: whileDeliveredOnly } = await admin.rpc(
        "undo_guest_order_ready",
        { p_order_id: deliveredOnly, p_actor_staff_id: staff.id },
      );
      check(
        /delivered/i.test(rpcMessage(whileDeliveredOnly)),
        "D undo Ready blocked while Delivered (no Out)",
        rpcMessage(whileDeliveredOnly),
      );
      const row = await loadLifecycle(id);
      const deliveredOnlyRow = await loadLifecycle(deliveredOnly);
      check(
        row.ready_at != null && deliveredOnlyRow.ready_at != null,
        "D Ready still set after blocked undos",
      );
    }

    // E. Undo Out blocked while Delivered
    {
      const id = await createOrder({
        name: `${SIG} Block Undo Out`,
        method: "delivery",
      });
      await admin.rpc("mark_guest_order_out_for_delivery", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      await admin.rpc("mark_guest_order_delivered", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      const { error } = await admin.rpc("undo_guest_order_out_for_delivery", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(
        /delivered/i.test(rpcMessage(error)),
        "E undo Out blocked while Delivered",
        rpcMessage(error),
      );
      const row = await loadLifecycle(id);
      check(row.out_for_delivery_at != null, "E Out still set");
    }

    // F. Delivery Picked Up RPC refused; stale picked_up_at ignored by Delivery RPCs
    {
      const id = await createOrder({
        name: `${SIG} Refuse Picked Up`,
        method: "delivery",
      });
      const { error: pickedErr } = await admin.rpc("mark_guest_order_picked_up", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(
        /out for delivery|delivered|not picked up/i.test(rpcMessage(pickedErr)),
        "F Delivery Picked Up RPC refused",
        rpcMessage(pickedErr),
      );

      const { error: staleErr } = await admin
        .from("orders")
        .update({ picked_up_at: new Date().toISOString() })
        .eq("id", id);
      check(!staleErr, "F seed stale Delivery picked_up_at", staleErr?.message);

      const { error: outErr } = await admin.rpc("mark_guest_order_out_for_delivery", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(
        !outErr,
        "F Out still allowed with stale picked_up_at",
        outErr?.message,
      );
      const row = await loadLifecycle(id);
      check(row.picked_up_at != null, "F stale picked_up_at left in place");
      check(row.out_for_delivery_at != null, "F out_for_delivery_at set independently");
      check(row.delivered_at == null, "F delivered_at not fabricated from picked_up");
    }

    // G. Pickup lifecycle unchanged; Delivery RPCs refused on Pickup
    {
      const id = await createOrder({ name: `${SIG} Pickup`, method: "pickup" });
      const { error: readyErr } = await admin.rpc("mark_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(!readyErr, "G Pickup mark Ready", readyErr?.message);
      const { error: pickedErr } = await admin.rpc("mark_guest_order_picked_up", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(!pickedErr, "G Pickup mark Picked Up", pickedErr?.message);
      const picked = await loadLifecycle(id);
      check(picked.ready_at != null && picked.picked_up_at != null, "G Pickup timestamps");
      check(
        picked.out_for_delivery_at == null && picked.delivered_at == null,
        "G Pickup has no Delivery timestamps",
      );

      const { error: undoPickedErr } = await admin.rpc("undo_guest_order_picked_up", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(!undoPickedErr, "G Pickup undo Picked Up", undoPickedErr?.message);
      const { error: undoReadyErr } = await admin.rpc("undo_guest_order_ready", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(!undoReadyErr, "G Pickup undo Ready", undoReadyErr?.message);

      const { error: outErr } = await admin.rpc("mark_guest_order_out_for_delivery", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(
        /delivery orders/i.test(rpcMessage(outErr)),
        "G Pickup cannot mark Out for Delivery",
        rpcMessage(outErr),
      );
      const { error: deliveredErr } = await admin.rpc("mark_guest_order_delivered", {
        p_order_id: id,
        p_actor_staff_id: staff.id,
      });
      check(
        /delivery orders/i.test(rpcMessage(deliveredErr)),
        "G Pickup cannot mark Delivered",
        rpcMessage(deliveredErr),
      );
    }

    // H. Actor required (unauthorized / missing staff denied)
    {
      const id = await createOrder({
        name: `${SIG} Actor Required`,
        method: "delivery",
      });
      const { error } = await admin.rpc("mark_guest_order_out_for_delivery", {
        p_order_id: id,
        p_actor_staff_id: "00000000-0000-0000-0000-000000000099",
      });
      check(
        /staff actor not found/i.test(rpcMessage(error)),
        "H unknown staff denied",
        rpcMessage(error),
      );
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
    for (const id of orderIds) {
      try {
        await cleanupOrder(id);
      } catch (err) {
        cleanupFailures.push(err instanceof Error ? err.message : String(err));
      }
    }

    const leftoverIds = new Set<string>();
    const { data: leftoverByName } = await admin
      .from("orders")
      .select("id, guest_name, internal_notes")
      .like("guest_name", `${SIG}%`);
    const { data: leftoverByNotes } = await admin
      .from("orders")
      .select("id, guest_name, internal_notes")
      .like("internal_notes", `${SIG}%`);
    for (const row of [...(leftoverByName ?? []), ...(leftoverByNotes ?? [])]) {
      leftoverIds.add(row.id);
    }
    leftoverIds.delete(PRODUCT_ORDER_ID);
    if (leftoverIds.size > 0) {
      cleanupFailures.push(
        `AUDIT leftover P5 fixtures after cleanup: ${[...leftoverIds].join(", ")}`,
      );
    }

    if (cleanupFailures.length > 0) {
      for (const message of cleanupFailures) {
        fail("fixture cleanup", message);
      }
    } else {
      pass(
        "fixture cleanup removed this run's SIG orders",
        `${orderIds.length} created`,
      );
    }
  }

  const failed = checks.filter((c) => !c.ok);
  console.log("");
  console.log(`M4-P5 live lifecycle: ${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length > 0) {
    for (const item of failed) {
      console.error(`  FAIL ${item.label}${item.detail ? ` — ${item.detail}` : ""}`);
    }
    process.exit(1);
  }
  console.log("M4-P5 live lifecycle: PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
