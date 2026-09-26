/**
 * Live DEV probe: canonical cancel_guest_order(p_order_id, p_actor_staff_id, p_override)
 * plus catalogue voucher release on cancel.
 * Run: npx tsx scripts/test-cancel-guest-order-live.ts
 * DEV only. Does not touch ORD-20260926-0009 or production.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
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

function singaporeYmd(value = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log("SKIP live DB (missing Supabase env).");
    process.exit(0);
  }
  if (!url.includes("tzwtpxdcggesgjaqxkqr")) {
    throw new Error("Refusing to run outside project-flour-dev.");
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const probe = await admin.rpc("cancel_guest_order", {
    p_order_id: "00000000-0000-0000-0000-000000000000",
    p_actor_staff_id: "00000000-0000-0000-0000-000000000001",
    p_override: false,
  });
  if (probe.error?.message.includes("schema cache")) {
    throw new Error(probe.error.message);
  }

  const { data: roles } = await admin.from("roles").select("id, code");
  const roleByCode = new Map((roles ?? []).map((row) => [row.code, row.id]));
  async function staffForRole(code: string) {
    const roleId = roleByCode.get(code);
    if (!roleId) return null;
    const { data } = await admin
      .from("staff_profiles")
      .select("id")
      .eq("role_id", roleId)
      .eq("is_active", true)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    return data;
  }

  const owner = await staffForRole("owner");
  const bakery = await staffForRole("bakery");
  if (!owner?.id) {
    console.log("SKIP live cancel (no owner staff).");
    return;
  }

  const today = singaporeYmd();
  const stamp = Date.now().toString().slice(-8);
  const created: { voucherIds: string[]; orderIds: string[] } = {
    voucherIds: [],
    orderIds: [],
  };

  const { data: cake } = await admin
    .from("library_cake_sizes")
    .select("id, cake_id, label, price, library_cakes(name)")
    .gt("price", 5)
    .limit(1)
    .maybeSingle();
  if (!cake) {
    console.log("SKIP live cancel (no cake size).");
    return;
  }
  const relatedCake = cake.library_cakes as
    | { name?: string }
    | Array<{ name?: string }>
    | null;
  const cakeName = Array.isArray(relatedCake)
    ? relatedCake[0]?.name
    : relatedCake?.name;
  if (!cakeName) {
    console.log("SKIP live cancel (no cake name).");
    return;
  }

  async function createOrder(label: string) {
    const { data: orderNumber, error: numberError } = await admin.rpc(
      "allocate_order_number",
    );
    if (numberError || !orderNumber) {
      throw new Error(numberError?.message ?? "Could not allocate order number.");
    }
    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_id: null,
        guest_name: label,
        guest_phone: "0190000888",
        fulfilment_method: "pickup",
        pickup_date: today,
        pickup_time: "15:00:00",
        status: "submitted",
        payment_status: "unpaid",
        customer_notes: label,
        extra_stock_id: null,
        order_source: "customer_website",
        include_receipt: false,
      })
      .select("id")
      .single();
    if (orderError || !order) {
      throw new Error(orderError?.message ?? "Could not create probe order.");
    }
    created.orderIds.push(order.id);
    const { error: itemError } = await admin.from("order_items").insert({
      order_id: order.id,
      cake_id: cake!.cake_id,
      cake_size_id: cake!.id,
      cake_name: cakeName,
      size_label: cake!.label,
      quantity: 1,
      unit_price: Number(cake!.price),
    });
    if (itemError) throw new Error(itemError.message);
    return order.id;
  }

  try {
    const plainOrder = await createOrder(`CANCEL-${stamp} plain`);
    if (bakery?.id) {
      const denied = await admin.rpc("cancel_guest_order", {
        p_order_id: plainOrder,
        p_actor_staff_id: bakery.id,
        p_override: false,
      });
      assert.match(denied.error?.message ?? "", /Not authorized/i);
    }

    const cancelled = await admin.rpc("cancel_guest_order", {
      p_order_id: plainOrder,
      p_actor_staff_id: owner.id,
      p_override: false,
    });
    if (cancelled.error) throw new Error(cancelled.error.message);
    const { data: plainAfter } = await admin
      .from("orders")
      .select("status")
      .eq("id", plainOrder)
      .single();
    assert.equal(plainAfter?.status, "cancelled");
    const { data: timeline } = await admin
      .from("order_timeline_events")
      .select("event_type")
      .eq("order_id", plainOrder)
      .eq("event_type", "order_cancelled");
    assert.ok((timeline?.length ?? 0) >= 1);

    const repeat = await admin.rpc("cancel_guest_order", {
      p_order_id: plainOrder,
      p_actor_staff_id: owner.id,
      p_override: false,
    });
    assert.match(repeat.error?.message ?? "", /already cancelled/i);

    const { data: voucher, error: voucherError } = await admin
      .from("library_vouchers")
      .insert({
        code: `CANRED-${stamp}`,
        voucher_type: "fixed_amount",
        value: 5,
        valid_from: today,
        valid_until: today,
        status: "active",
        redemption_limit: 1,
      })
      .select("id")
      .single();
    if (voucherError || !voucher) {
      throw new Error(voucherError?.message ?? "Could not create probe voucher.");
    }
    created.voucherIds.push(voucher.id);

    const voucherOrder = await createOrder(`CANCEL-${stamp} voucher`);
    const applied = await admin.rpc("apply_catalogue_voucher_to_guest_order", {
      p_order_id: voucherOrder,
      p_voucher_id: voucher.id,
      p_actor_staff_id: null,
    });
    if (applied.error) throw new Error(applied.error.message);

    const { data: before } = await admin
      .from("catalogue_voucher_redemptions")
      .select("status")
      .eq("voucher_id", voucher.id)
      .eq("order_id", voucherOrder)
      .single();
    assert.equal(before?.status, "redeemed");

    const voucherCancel = await admin.rpc("cancel_guest_order", {
      p_order_id: voucherOrder,
      p_actor_staff_id: owner.id,
      p_override: false,
    });
    if (voucherCancel.error) throw new Error(voucherCancel.error.message);

    const { data: after } = await admin
      .from("catalogue_voucher_redemptions")
      .select("status, released_at, release_reason, redeemed_at")
      .eq("voucher_id", voucher.id)
      .eq("order_id", voucherOrder)
      .single();
    assert.equal(after?.status, "released");
    assert.ok(after?.released_at);
    assert.ok(after?.redeemed_at);
    assert.equal(after?.release_reason, "order_cancelled");

    const { data: secondRelease } = await admin.rpc(
      "release_catalogue_voucher_redemptions_for_order",
      {
        p_order_id: voucherOrder,
        p_actor_staff_id: owner.id,
        p_reason: "order_cancelled",
      },
    );
    assert.equal(secondRelease, 0);

    const { data: active } = await admin
      .from("catalogue_voucher_redemptions")
      .select("id")
      .eq("voucher_id", voucher.id)
      .eq("status", "redeemed");
    const { data: released } = await admin
      .from("catalogue_voucher_redemptions")
      .select("id")
      .eq("voucher_id", voucher.id)
      .eq("status", "released");
    assert.equal(active?.length, 0);
    assert.equal(released?.length, 1);

    console.log("cancel guest order live DEV probe passed");
  } finally {
    if (created.voucherIds.length > 0) {
      await admin
        .from("catalogue_voucher_redemptions")
        .delete()
        .in("voucher_id", created.voucherIds);
    }
    if (created.orderIds.length > 0) {
      await admin.from("order_adjustments").delete().in("order_id", created.orderIds);
      await admin.from("order_items").delete().in("order_id", created.orderIds);
      await admin.from("order_timeline_events").delete().in("order_id", created.orderIds);
      await admin.from("orders").delete().in("id", created.orderIds);
    }
    if (created.voucherIds.length > 0) {
      await admin.from("library_vouchers").delete().in("id", created.voucherIds);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
