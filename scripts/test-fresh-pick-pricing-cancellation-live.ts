/**
 * Disposable DEV-only Fresh Pick pricing, cancellation, and claim-safety probe.
 * Run: npx tsx scripts/test-fresh-pick-pricing-cancellation-live.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function toBusinessDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuching",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addBusinessCalendarDays(ymd: string, count: number): string {
  const date = new Date(`${ymd}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + count);
  return toBusinessDateKey(date);
}

function extraPickupThroughIso(ymd: string, time: string): string | null {
  const value = new Date(`${ymd}T${time}:00+08:00`);
  return Number.isFinite(value.getTime()) ? value.toISOString() : null;
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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("DEV Supabase credentials are required for this live test.");
  }
  if (new URL(url).hostname.split(".")[0] !== "tzwtpxdcggesgjaqxkqr") {
    throw new Error("Refusing to run outside the Project Flour DEV project.");
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: roles, error: rolesError } = await admin
    .from("roles")
    .select("id, code");
  if (rolesError) throw new Error(`Could not read DEV staff roles: ${rolesError.message}`);
  const ownerRoleId = roles?.find((row) => row.code === "owner")?.id;
  if (!ownerRoleId) throw new Error("No owner role is available in DEV.");
  const { data: owner } = await admin
    .from("staff_profiles")
    .select("id")
    .eq("role_id", ownerRoleId)
    .eq("is_active", true)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (!owner?.id) throw new Error("No active DEV owner is available.");

  const signature = `FP-CANCEL-${Date.now()}`;
  const pickupDate = addBusinessCalendarDays(toBusinessDateKey(), 1);
  if (!pickupDate) throw new Error("Could not determine a DEV pickup date.");
  const pickupFrom = extraPickupThroughIso(pickupDate, "12:00");
  const pickupThrough = extraPickupThroughIso(pickupDate, "17:30");
  if (!pickupFrom || !pickupThrough) throw new Error("Could not build pickup window.");

  const created = {
    cakeId: "",
    sizeId: "",
    voucherId: "",
    extraIds: [] as string[],
    orderIds: [] as string[],
    paymentIds: [] as string[],
  };

  async function createExtra(label: string): Promise<string> {
    const { data, error } = await admin.rpc("propose_extra_stock", {
      p_actor_staff_id: owner.id,
      p_cake_name: `${signature} ${label}`,
      p_size_label: "6\"",
      p_prepared_on: pickupDate,
      p_note: signature,
      p_library_cake_id: created.cakeId,
      p_library_cake_size_id: created.sizeId,
    });
    if (error || !data?.id) throw new Error(error?.message ?? "Could not propose fixture stock.");
    const id = data.id as string;
    created.extraIds.push(id);
    const { error: confirmError } = await admin.rpc("confirm_extra_stock", {
      p_extra_stock_id: id,
      p_actor_staff_id: owner.id,
      p_prepared_on: pickupDate,
      p_pickup_available_from_at: pickupFrom,
      p_pickup_through_at: pickupThrough,
    });
    if (confirmError) throw new Error(confirmError.message);
    return id;
  }

  async function buy(extraId: string, label: string) {
    const { data, error } = await admin.rpc("submit_guest_extra_order", {
      p_customer_name: `${signature} ${label}`,
      p_phone: "01900009999",
      p_email: null,
      p_pickup_date: pickupDate,
      p_pickup_time: "12:00",
      p_notes: signature,
      p_extra_stock_id: extraId,
    });
    if (error || !data?.id) throw new Error(error?.message ?? "Fresh Pick submit failed.");
    const orderId = data.id as string;
    created.orderIds.push(orderId);
    return { orderId, order: data };
  }

  async function cancel(orderId: string) {
    const { error } = await admin.rpc("cancel_guest_order", {
      p_order_id: orderId,
      p_actor_staff_id: owner.id,
      p_override: false,
    });
    if (error) throw new Error(error.message);
  }

  async function attachPayment(orderId: string, amount: number) {
    const { data, error } = await admin
      .from("payments")
      .insert({
        amount,
        method: "wb_qr",
        paid_at: new Date().toISOString(),
        reference_note: signature,
        verified_by: owner.id,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not create payment fixture.");
    created.paymentIds.push(data.id);
    const { error: allocationError } = await admin.from("payment_allocations").insert({
      payment_id: data.id,
      order_id: orderId,
      amount,
    });
    if (allocationError) throw new Error(allocationError.message);
  }

  try {
    const { data: cake, error: cakeError } = await admin
      .from("library_cakes")
      .insert({
        name: signature,
        status: "draft",
        created_by: owner.id,
        updated_by: owner.id,
      })
      .select("id")
      .single();
    if (cakeError || !cake) throw new Error(cakeError?.message ?? "Could not create fixture cake.");
    created.cakeId = cake.id;

    const { data: size, error: sizeError } = await admin
      .from("library_cake_sizes")
      .insert({ cake_id: cake.id, label: "6\"", price: 135, sort_order: 0 })
      .select("id")
      .single();
    if (sizeError || !size) throw new Error(sizeError?.message ?? "Could not create fixture size.");
    created.sizeId = size.id;

    const { error: scheduledPriceError } = await admin
      .from("library_cake_size_prices")
      .insert({
        cake_size_id: size.id,
        price: 140,
        effective_from: pickupDate,
        effective_to: pickupDate,
      });
    if (scheduledPriceError) throw new Error(scheduledPriceError.message);
    const { data: scheduledPrice, error: priceError } = await admin.rpc(
      "library_cake_size_price_on",
      { p_cake_size_id: size.id, p_pickup_date: pickupDate },
    );
    if (priceError) throw new Error(priceError.message);
    assert.equal(Number(scheduledPrice), 140, "date resolver returns scheduled price");
    const fallbackDate = addBusinessCalendarDays(pickupDate, 1);
    if (!fallbackDate) throw new Error("Could not determine fallback date.");
    const { data: fallbackPrice, error: fallbackError } = await admin.rpc(
      "library_cake_size_price_on",
      { p_cake_size_id: size.id, p_pickup_date: fallbackDate },
    );
    if (fallbackError) throw new Error(fallbackError.message);
    assert.equal(Number(fallbackPrice), 135, "date resolver falls back to base price");

    const { data: voucher, error: voucherError } = await admin
      .from("library_vouchers")
      .insert({
        code: `${signature}-VOUCHER`,
        voucher_type: "fixed_amount",
        value: 10,
        valid_from: toBusinessDateKey(),
        valid_until: pickupDate,
        status: "active",
        created_by: owner.id,
        updated_by: owner.id,
      })
      .select("id")
      .single();
    if (voucherError || !voucher) throw new Error(voucherError?.message ?? "Could not create voucher fixture.");
    created.voucherId = voucher.id;
    const { data: rules, error: rulesError } = await admin
      .from("library_voucher_rules")
      .insert([
        { voucher_id: voucher.id, rule_type: "order_type" },
        { voucher_id: voucher.id, rule_type: "cake_size" },
      ])
      .select("id, rule_type");
    if (rulesError || !rules) throw new Error(rulesError?.message ?? "Could not create voucher rules.");
    const orderTypeRule = rules.find((rule) => rule.rule_type === "order_type");
    const cakeSizeRule = rules.find((rule) => rule.rule_type === "cake_size");
    if (!orderTypeRule || !cakeSizeRule) throw new Error("Voucher rules were not returned.");
    const { error: valuesError } = await admin.from("library_voucher_rule_values").insert([
      { rule_id: orderTypeRule.id, value_code: "fresh_pick" },
      { rule_id: cakeSizeRule.id, cake_size_id: size.id },
    ]);
    if (valuesError) throw new Error(valuesError.message);

    const mainExtra = await createExtra("MAIN");
    const first = await buy(mainExtra, "first purchase");
    assert.equal(first.order.extra_stock_id, mainExtra);
    const { data: firstItem, error: itemError } = await admin
      .from("order_items")
      .select("cake_id, cake_size_id, unit_price")
      .eq("order_id", first.orderId)
      .single();
    if (itemError || !firstItem) throw new Error(itemError?.message ?? "Order item was not created.");
    assert.equal(firstItem.cake_id, cake.id);
    assert.equal(firstItem.cake_size_id, size.id);
    assert.equal(Number(firstItem.unit_price), 140, "order item snapshots scheduled price");
    const { data: firstStock } = await admin
      .from("extra_stock")
      .select("order_id, sold_at")
      .eq("id", mainExtra)
      .single();
    assert.equal(firstStock?.order_id, first.orderId);
    assert.ok(firstStock?.sold_at);

    const { data: applied, error: applyError } = await admin.rpc(
      "apply_catalogue_voucher_to_guest_order",
      { p_order_id: first.orderId, p_voucher_id: voucher.id, p_actor_staff_id: null },
    );
    if (applyError) throw new Error(`Fresh Pick voucher validation failed: ${applyError.message}`);
    assert.equal(Number(applied?.amount), 10);
    await cancel(first.orderId);
    const { data: cancelledFirst } = await admin
      .from("orders")
      .select("status, extra_stock_id")
      .eq("id", first.orderId)
      .single();
    assert.equal(cancelledFirst?.status, "cancelled");
    assert.equal(cancelledFirst?.extra_stock_id, mainExtra);
    const { data: releasedStock } = await admin
      .from("extra_stock")
      .select("order_id, sold_at, lifecycle, cut_into_slices_at, pickup_through_at")
      .eq("id", mainExtra)
      .single();
    assert.equal(releasedStock?.order_id, null);
    assert.equal(releasedStock?.sold_at, null);
    assert.equal(releasedStock?.lifecycle, "confirmed");
    assert.equal(releasedStock?.cut_into_slices_at, null);
    assert.equal(releasedStock?.lifecycle, "confirmed");
    assert.equal(releasedStock?.sold_at, null);
    assert.ok(Date.parse(releasedStock?.pickup_through_at ?? "") > Date.now());
    const { data: releasedEvent } = await admin
      .from("extra_stock_events")
      .select("event_type, metadata")
      .eq("extra_stock_id", mainExtra)
      .eq("event_type", "released")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assert.equal(releasedEvent?.metadata?.reason, "customer_order_cancelled");
    assert.equal(releasedEvent?.metadata?.order_id, first.orderId);
    const { data: voucherRelease } = await admin
      .from("catalogue_voucher_redemptions")
      .select("status, release_reason")
      .eq("order_id", first.orderId)
      .eq("voucher_id", voucher.id)
      .single();
    assert.equal(voucherRelease?.status, "released");
    assert.equal(voucherRelease?.release_reason, "order_cancelled");

    const second = await buy(mainExtra, "repurchase");
    assert.equal(second.order.extra_stock_id, mainExtra);
    const { data: historicalFirst } = await admin
      .from("orders")
      .select("status, extra_stock_id")
      .eq("id", first.orderId)
      .single();
    assert.equal(historicalFirst?.status, "cancelled");
    assert.equal(historicalFirst?.extra_stock_id, mainExtra);
    const { data: secondStock } = await admin
      .from("extra_stock")
      .select("order_id, sold_at")
      .eq("id", mainExtra)
      .single();
    assert.equal(secondStock?.order_id, second.orderId);
    assert.ok(secondStock?.sold_at);
    const secondVoucher = await admin.rpc("apply_catalogue_voucher_to_guest_order", {
      p_order_id: second.orderId,
      p_voucher_id: voucher.id,
      p_actor_staff_id: null,
    });
    if (secondVoucher.error) throw new Error(secondVoucher.error.message);

    const safetyExtra = await createExtra("SAFETY");
    const safetyOrder = await buy(safetyExtra, "safety purchase");
    const { data: otherOrderNumber, error: numberError } = await admin.rpc("allocate_order_number");
    if (numberError || !otherOrderNumber) throw new Error(numberError?.message ?? "Could not allocate safety order number.");
    const { data: otherOrder, error: otherOrderError } = await admin
      .from("orders")
      .insert({
        order_number: otherOrderNumber,
        customer_id: null,
        guest_name: `${signature} reassigned owner`,
        guest_phone: "01900009999",
        fulfilment_method: "pickup",
        pickup_date: pickupDate,
        pickup_time: "12:00:00",
        status: "submitted",
        payment_status: "unpaid",
        customer_notes: signature,
        extra_stock_id: null,
        order_source: "customer_website",
        include_receipt: false,
      })
      .select("id")
      .single();
    if (otherOrderError || !otherOrder) throw new Error(otherOrderError?.message ?? "Could not create safety owner order.");
    created.orderIds.push(otherOrder.id);
    const { error: reassignError } = await admin
      .from("extra_stock")
      .update({ order_id: otherOrder.id, sold_at: new Date().toISOString() })
      .eq("id", safetyExtra);
    if (reassignError) throw new Error(reassignError.message);
    await cancel(safetyOrder.orderId);
    const { data: protectedStock } = await admin
      .from("extra_stock")
      .select("order_id, sold_at")
      .eq("id", safetyExtra)
      .single();
    assert.equal(protectedStock?.order_id, otherOrder.id, "cancellation does not release reassigned stock");
    assert.ok(protectedStock?.sold_at);

    const partialExtra = await createExtra("PARTIAL");
    const partial = await buy(partialExtra, "partial payment");
    await attachPayment(partial.orderId, 25);
    await cancel(partial.orderId);
    const { data: partialStock } = await admin
      .from("extra_stock")
      .select("order_id, sold_at")
      .eq("id", partialExtra)
      .single();
    assert.equal(partialStock?.order_id, partial.orderId, "partially paid cancellation keeps stock claimed");
    assert.ok(partialStock?.sold_at);

    const paidExtra = await createExtra("PAID");
    const paid = await buy(paidExtra, "paid order");
    await attachPayment(paid.orderId, 140);
    const { error: paidStatusError } = await admin
      .from("orders")
      .update({ status: "paid", payment_status: "paid" })
      .eq("id", paid.orderId);
    if (paidStatusError) throw new Error(paidStatusError.message);
    await cancel(paid.orderId);
    const { data: paidStock } = await admin
      .from("extra_stock")
      .select("order_id, sold_at")
      .eq("id", paidExtra)
      .single();
    assert.equal(paidStock?.order_id, paid.orderId, "paid cancellation keeps stock claimed pending refund policy");
    assert.ok(paidStock?.sold_at);

    const raceExtra = await createExtra("RACE");
    const raceResults = await Promise.all([
      admin.rpc("submit_guest_extra_order", {
        p_customer_name: `${signature} race A`,
        p_phone: "01900009999",
        p_email: null,
        p_pickup_date: pickupDate,
        p_pickup_time: "12:00",
        p_notes: signature,
        p_extra_stock_id: raceExtra,
      }),
      admin.rpc("submit_guest_extra_order", {
        p_customer_name: `${signature} race B`,
        p_phone: "01900009999",
        p_email: null,
        p_pickup_date: pickupDate,
        p_pickup_time: "12:00",
        p_notes: signature,
        p_extra_stock_id: raceExtra,
      }),
    ]);
    const successfulRaces = raceResults.filter((result) => !result.error && result.data?.id);
    const failedRaces = raceResults.filter((result) => result.error);
    assert.equal(successfulRaces.length, 1, "only one concurrent Fresh Pick claim succeeds");
    assert.equal(failedRaces.length, 1);
    const raceOrderId = successfulRaces[0]?.data?.id as string;
    created.orderIds.push(raceOrderId);
    const { data: activeClaims } = await admin
      .from("orders")
      .select("id")
      .eq("extra_stock_id", raceExtra)
      .neq("status", "cancelled");
    assert.equal(activeClaims?.length, 1, "at most one active order claims the Extra");

    console.log("PASS DEV Fresh Pick scheduled price, voucher, release, repurchase, payment safety, and concurrent claim checks");
  } finally {
    if (created.orderIds.length) {
      await admin.from("catalogue_voucher_redemptions").delete().in("order_id", created.orderIds);
      await admin.from("payment_allocations").delete().in("order_id", created.orderIds);
      await admin.from("order_adjustments").delete().in("order_id", created.orderIds);
      await admin.from("order_items").delete().in("order_id", created.orderIds);
      await admin.from("order_timeline_events").delete().in("order_id", created.orderIds);
      await admin.from("orders").delete().in("id", created.orderIds);
    }
    if (created.paymentIds.length) {
      await admin.from("payments").delete().in("id", created.paymentIds);
    }
    if (created.extraIds.length) {
      await admin.from("extra_stock").delete().in("id", created.extraIds);
    }
    if (created.voucherId) {
      await admin.from("library_vouchers").delete().eq("id", created.voucherId);
    }
    if (created.sizeId) {
      await admin.from("library_cake_size_prices").delete().eq("cake_size_id", created.sizeId);
      await admin.from("library_cake_sizes").delete().eq("id", created.sizeId);
    }
    if (created.cakeId) {
      await admin.from("library_cakes").delete().eq("id", created.cakeId);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
