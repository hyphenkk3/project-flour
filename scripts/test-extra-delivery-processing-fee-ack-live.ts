/**
 * Live Delivery processing-fee acknowledgement for submit_guest_extra_order.
 * Run: npx tsx scripts/test-extra-delivery-processing-fee-ack-live.ts
 *
 * Disposable Extra (+ Extra-order) fixtures only. Cleanup always.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getDeliverySlotsForDate } from "@/engines/business-calendar/delivery-hours";
import {
  extraPickupThroughIso,
  extraOperatingSlotsForDate,
} from "@/engines/extra/fresh-picks-eligibility";
import { CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT } from "@/engines/orders/delivery-finance";
import {
  buildDeliveryProcessingFeeAckPayload,
  DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE,
} from "@/engines/orders/delivery-processing-fee-ack";
import { OWNER_DELIVERY_CITY, OWNER_DELIVERY_STATE } from "@/engines/orders/fulfilment";
import { addBusinessCalendarDays, toBusinessDateKey } from "@/lib/dates";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

function deliveryPayload() {
  return {
    recipient_name: "Ack Recipient",
    recipient_phone: "0190000099",
    address_line_1: "1 Test Delivery Road",
    address_line_2: null,
    postcode: "88000",
    city: OWNER_DELIVERY_CITY,
    state: OWNER_DELIVERY_STATE,
    recipient_notify_preference: "inform_recipient",
  };
}

void (async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log("SKIP extra delivery processing fee ack (missing Supabase env)");
    return;
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: probeError } = await admin.rpc("submit_guest_extra_order", {
    p_customer_name: "probe",
    p_phone: "0100000000",
    p_email: null,
    p_pickup_date: "2000-01-01",
    p_pickup_time: "15:00:00",
    p_notes: null,
    p_extra_stock_id: "00000000-0000-0000-0000-000000000000",
    p_fulfilment_method: "delivery",
    p_delivery: deliveryPayload(),
    p_delivery_processing_fee_ack: buildDeliveryProcessingFeeAckPayload(),
  });
  if (
    probeError &&
    /Could not find the function|schema cache/i.test(probeError.message)
  ) {
    console.log(
      "SKIP extra delivery processing fee ack (DEV function not updated yet)",
    );
    return;
  }

  const { data: roles } = await admin.from("roles").select("id, code");
  const roleByCode = new Map((roles ?? []).map((row) => [row.code, row.id]));
  async function activeStaffForRole(code: string) {
    const roleId = roleByCode.get(code);
    if (!roleId) return null;
    const { data } = await admin
      .from("staff_profiles")
      .select("id")
      .eq("role_id", roleId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    return data;
  }
  const bakery = await activeStaffForRole("bakery");
  const manager = await activeStaffForRole("manager");
  const owner = await activeStaffForRole("owner");
  const actor = bakery ?? manager ?? owner;
  if (!actor?.id) throw new Error("No bakery-capable staff_profiles row");

  const { data: cake } = await admin
    .from("library_cakes")
    .select("id, name, library_cake_sizes ( id, label )")
    .in("status", ["active", "seasonal"])
    .limit(1)
    .maybeSingle();
  type SizeEmbed = { id: string; label: string };
  const sizes = (cake?.library_cake_sizes ?? []) as SizeEmbed[];
  const size = sizes[0];
  if (!cake?.id || !size?.id) throw new Error("Need an active Library cake/size");

  const stamp = Date.now();
  const todayYmd = toBusinessDateKey();
  const pickupDate = addBusinessCalendarDays(todayYmd, 1) ?? todayYmd;
  const deliverySlot =
    getDeliverySlotsForDate(pickupDate)[0]?.value ??
    extraOperatingSlotsForDate(pickupDate)[0]?.value ??
    "14:00";
  const fromIso = extraPickupThroughIso(pickupDate, "10:00");
  const throughIso = extraPickupThroughIso(pickupDate, "17:30");
  if (!fromIso || !throughIso) throw new Error("Could not build Extra window");

  const extraIds: string[] = [];
  const orderIds: string[] = [];

  async function proposeNamed(name: string) {
    const { data, error } = await admin.rpc("propose_extra_stock", {
      p_actor_staff_id: actor.id,
      p_cake_name: `${name} ${stamp}`,
      p_size_label: size.label,
      p_prepared_on: pickupDate,
      p_note: `extra-delivery-ack-${stamp}`,
      p_library_cake_id: cake.id,
      p_library_cake_size_id: size.id,
    });
    const id = data?.id as string | undefined;
    if (id) extraIds.push(id);
    if (error || !id) throw new Error(error?.message ?? "propose_extra_stock failed");
    const { error: confirmError } = await admin.rpc("confirm_extra_stock", {
      p_extra_stock_id: id,
      p_actor_staff_id: actor.id,
      p_prepared_on: pickupDate,
      p_pickup_available_from_at: fromIso,
      p_pickup_through_at: throughIso,
    });
    if (confirmError) throw new Error(confirmError.message);
    return id;
  }

  try {
    const missingId = await proposeNamed("AckMissing");
    const guestArgs = {
      p_customer_name: `Extra delivery ack ${stamp}`,
      p_phone: "0190000077",
      p_email: null,
      p_pickup_date: pickupDate,
      p_pickup_time: `${deliverySlot}:00`,
      p_notes: `extra-delivery-ack-${stamp}`,
      p_extra_stock_id: missingId,
      p_include_receipt: false,
      p_fulfilment_method: "delivery" as const,
      p_delivery: deliveryPayload(),
    };

    const { data: missingOrder, error: missingErr } = await admin.rpc(
      "submit_guest_extra_order",
      guestArgs,
    );
    if (missingOrder?.id) orderIds.push(missingOrder.id);
    assert.ok(missingErr, "Fresh Pick Delivery without ack must reject");
    assert.match(
      missingErr?.message ?? "",
      /acknowledge the RM5 delivery processing fee/i,
    );
    assert.equal(missingOrder?.id, undefined);
    assert.match(DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE, /RM5/);
    const { data: missingStock } = await admin
      .from("extra_stock")
      .select("sold_at")
      .eq("id", missingId)
      .maybeSingle();
    assert.equal(missingStock?.sold_at, null, "rejected Delivery must not sell Extra");

    const { data: wrongFeeOrder, error: wrongFeeErr } = await admin.rpc(
      "submit_guest_extra_order",
      {
        ...guestArgs,
        p_customer_name: `Extra wrong fee ${stamp}`,
        p_delivery_processing_fee_ack: {
          fulfilment_method: "delivery",
          processing_fee: 0,
        },
      },
    );
    if (wrongFeeOrder?.id) orderIds.push(wrongFeeOrder.id);
    assert.ok(wrongFeeErr, "incorrect Extra processing-fee amount must reject");
    assert.equal(wrongFeeOrder?.id, undefined);
    const { data: wrongStock } = await admin
      .from("extra_stock")
      .select("sold_at")
      .eq("id", missingId)
      .maybeSingle();
    assert.equal(wrongStock?.sold_at, null);

    const { data: okOrder, error: okErr } = await admin.rpc(
      "submit_guest_extra_order",
      {
        ...guestArgs,
        p_customer_name: `Extra delivery ok ${stamp}`,
        p_delivery_processing_fee_ack: buildDeliveryProcessingFeeAckPayload(),
      },
    );
    if (okErr) throw new Error(okErr.message);
    if (okOrder?.id) orderIds.push(okOrder.id);
    assert.ok(okOrder?.id, "valid RM5 Extra acknowledgement must create an order");
    const { data: details } = await admin
      .from("order_delivery_details")
      .select("processing_fee_applicable_amount, delivery_fee_status")
      .eq("order_id", okOrder.id)
      .maybeSingle();
    assert.equal(
      Number(details?.processing_fee_applicable_amount),
      CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT,
    );
    assert.equal(details?.delivery_fee_status, "not_set");

    const pickupId = await proposeNamed("AckPickup");
    const { data: pickupOrder, error: pickupErr } = await admin.rpc(
      "submit_guest_extra_order",
      {
        p_customer_name: `Extra pickup no ack ${stamp}`,
        p_phone: "0190000077",
        p_email: null,
        p_pickup_date: pickupDate,
        p_pickup_time: extraOperatingSlotsForDate(pickupDate)[0]?.value ?? "15:00",
        p_notes: `extra-pickup-no-ack-${stamp}`,
        p_extra_stock_id: pickupId,
        p_include_receipt: false,
        p_fulfilment_method: "pickup",
      },
    );
    if (pickupErr) throw new Error(pickupErr.message);
    if (pickupOrder?.id) orderIds.push(pickupOrder.id);
    assert.ok(pickupOrder?.id, "Fresh Pick Pickup must not require delivery ack");

    console.log("PASS extra delivery processing fee acknowledgement (live)");
  } finally {
    for (const orderId of orderIds) {
      await admin.from("order_adjustments").delete().eq("order_id", orderId);
      await admin.from("order_delivery_details").delete().eq("order_id", orderId);
      await admin.from("order_timeline_events").delete().eq("order_id", orderId);
      await admin.from("order_items").delete().eq("order_id", orderId);
      await admin.from("order_complimentary_items").delete().eq("order_id", orderId);
      await admin.from("orders").delete().eq("id", orderId);
    }
    if (extraIds.length > 0) {
      await admin.from("extra_stock").update({ order_id: null }).in("id", extraIds);
      await admin.from("extra_stock").delete().in("id", extraIds);
    }
  }
})().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
