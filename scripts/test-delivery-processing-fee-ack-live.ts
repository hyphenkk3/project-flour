/**
 * Live Delivery processing-fee acknowledgement for submit_guest_preorder.
 * Run: npx tsx scripts/test-delivery-processing-fee-ack-live.ts
 *
 * Disposable cake/order rows only. Does not modify production, Fresh Picks, or EXTRA.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDeliverySlotsForDate } from "@/engines/business-calendar/delivery-hours";
import { CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT } from "@/engines/orders/delivery-finance";
import {
  buildDeliveryProcessingFeeAckPayload,
  DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE,
} from "@/engines/orders/delivery-processing-fee-ack";
import { OWNER_DELIVERY_CITY, OWNER_DELIVERY_STATE } from "@/engines/orders/fulfilment";

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
    console.log("SKIP live delivery processing fee ack (missing Supabase env)");
    return;
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: probeError } = await admin.rpc("submit_guest_preorder", {
    p_customer_name: "probe",
    p_phone: "0100000000",
    p_email: null,
    p_pickup_date: "2000-01-01",
    p_pickup_time: "15:00:00",
    p_notes: null,
    p_items: [],
    p_price_ack: { pickup_date: "2000-01-01", lines: [] },
    p_delivery_processing_fee_ack: buildDeliveryProcessingFeeAckPayload(),
  });
  if (
    probeError &&
    /Could not find the function|schema cache/i.test(probeError.message)
  ) {
    console.log(
      "SKIP live delivery processing fee ack (DEV function not updated yet)",
    );
    return;
  }

  const { data: category, error: categoryError } = await admin
    .from("library_cake_categories")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (categoryError || !category?.id) {
    throw new Error(categoryError?.message ?? "No cake category");
  }

  const stamp = Date.now();
  const { data: cake, error: cakeError } = await admin
    .from("library_cakes")
    .insert({
      name: `Delivery fee ack ${stamp}`,
      category_id: category.id,
      status: "active",
      description: "Disposable Delivery processing-fee ack cake",
    })
    .select("id")
    .single();
  if (cakeError || !cake?.id) {
    throw new Error(cakeError?.message ?? "Failed to insert disposable cake");
  }

  const cleanup = {
    cakeId: cake.id,
    sizeIds: [] as string[],
    scheduleIds: [] as string[],
    orderIds: [] as string[],
    membershipIds: [] as string[],
  };

  const pickupDate = "2026-10-15";
  const deliverySlot = getDeliverySlotsForDate(pickupDate)[0]?.value ?? "14:00";

  try {
    const { data: size6, error: size6Error } = await admin
      .from("library_cake_sizes")
      .insert({
        cake_id: cake.id,
        label: '6"',
        price: 120,
        preorder_days: 2,
        sort_order: 1,
      })
      .select("id")
      .single();
    if (size6Error || !size6?.id) {
      throw new Error(size6Error?.message ?? "Failed to insert size");
    }
    cleanup.sizeIds.push(size6.id);

    const { data: schedule, error: scheduleError } = await admin
      .from("library_cake_size_prices")
      .insert({
        cake_size_id: size6.id,
        price: 120,
        effective_from: "2026-01-01",
        effective_to: null,
      })
      .select("id")
      .single();
    if (scheduleError || !schedule?.id) {
      throw new Error(scheduleError?.message ?? "Failed to insert price schedule");
    }
    cleanup.scheduleIds.push(schedule.id);

    const { data: collection } = await admin.rpc(
      "storefront_collection_for_pickup_date",
      { p_pickup_date: pickupDate },
    );
    if (!collection?.id) {
      console.log(
        "SKIP live delivery processing fee ack (no published catalogue for 2026-10-15)",
      );
      return;
    }

    const { data: membership, error: memErr } = await admin
      .from("collection_cakes")
      .insert({
        collection_id: collection.id,
        library_cake_id: cake.id,
        available: true,
        sort_order: 99,
      })
      .select("collection_id, library_cake_id")
      .maybeSingle();
    if (!memErr && membership) {
      cleanup.membershipIds.push(
        `${membership.collection_id}::${membership.library_cake_id}`,
      );
    }

    const guestArgs = {
      p_customer_name: `Delivery ack ${stamp}`,
      p_phone: "0190000088",
      p_email: null,
      p_pickup_date: pickupDate,
      p_pickup_time: `${deliverySlot}:00`,
      p_notes: "delivery-processing-fee-ack",
      p_items: [{ cake_id: cake.id, cake_size_id: size6.id, quantity: 1 }],
      p_email_submission_receipt_requested: false,
      p_fulfilment_method: "delivery" as const,
      p_delivery: deliveryPayload(),
      p_price_ack: {
        pickup_date: pickupDate,
        lines: [
          {
            cake_size_id: size6.id,
            quoted_unit_price: 120,
            acknowledged_unit_price: 120,
          },
        ],
      },
    };

    const { data: missingOrder, error: missingErr } = await admin.rpc(
      "submit_guest_preorder",
      guestArgs,
    );
    if (missingOrder?.id) cleanup.orderIds.push(missingOrder.id);
    assert.ok(missingErr, "Delivery without processing-fee ack must reject");
    assert.match(
      missingErr?.message ?? "",
      /acknowledge the RM5 delivery processing fee/i,
    );
    assert.equal(missingOrder?.id, undefined);
    assert.match(DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE, /RM5/);

    const { data: wrongFeeOrder, error: wrongFeeErr } = await admin.rpc(
      "submit_guest_preorder",
      {
        ...guestArgs,
        p_customer_name: `Delivery wrong fee ${stamp}`,
        p_delivery_processing_fee_ack: {
          fulfilment_method: "delivery",
          processing_fee: 0,
        },
      },
    );
    if (wrongFeeOrder?.id) cleanup.orderIds.push(wrongFeeOrder.id);
    assert.ok(wrongFeeErr, "incorrect processing-fee amount must reject");
    assert.match(
      wrongFeeErr?.message ?? "",
      /acknowledge the RM5 delivery processing fee/i,
    );
    assert.equal(wrongFeeOrder?.id, undefined);

    const { data: arbitraryFeeOrder, error: arbitraryFeeErr } = await admin.rpc(
      "submit_guest_preorder",
      {
        ...guestArgs,
        p_customer_name: `Delivery arbitrary fee ${stamp}`,
        p_delivery_processing_fee_ack: {
          fulfilment_method: "delivery",
          processing_fee: 99,
        },
      },
    );
    if (arbitraryFeeOrder?.id) cleanup.orderIds.push(arbitraryFeeOrder.id);
    assert.ok(arbitraryFeeErr, "arbitrary client fee must reject");
    assert.equal(arbitraryFeeOrder?.id, undefined);

    const { data: okOrder, error: okErr } = await admin.rpc(
      "submit_guest_preorder",
      {
        ...guestArgs,
        p_customer_name: `Delivery ok ${stamp}`,
        p_delivery_processing_fee_ack: buildDeliveryProcessingFeeAckPayload(),
      },
    );
    if (okErr) throw new Error(okErr.message);
    if (okOrder?.id) cleanup.orderIds.push(okOrder.id);
    assert.ok(okOrder?.id, "valid RM5 acknowledgement must create an order");

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

    const { data: pickupOrder, error: pickupErr } = await admin.rpc(
      "submit_guest_preorder",
      {
        p_customer_name: `Pickup no delivery ack ${stamp}`,
        p_phone: "0190000088",
        p_email: null,
        p_pickup_date: pickupDate,
        p_pickup_time: "16:00:00",
        p_notes: "pickup-no-delivery-ack",
        p_items: [{ cake_id: cake.id, cake_size_id: size6.id, quantity: 1 }],
        p_email_submission_receipt_requested: false,
        p_fulfilment_method: "pickup",
        p_price_ack: guestArgs.p_price_ack,
      },
    );
    if (pickupErr) throw new Error(pickupErr.message);
    if (pickupOrder?.id) cleanup.orderIds.push(pickupOrder.id);
    assert.ok(pickupOrder?.id, "Pickup must not require delivery processing ack");

    console.log("PASS delivery processing fee acknowledgement (live)");
  } finally {
    for (const orderId of cleanup.orderIds) {
      await admin.from("order_adjustments").delete().eq("order_id", orderId);
      await admin.from("order_delivery_details").delete().eq("order_id", orderId);
      await admin.from("order_timeline_events").delete().eq("order_id", orderId);
      await admin.from("order_items").delete().eq("order_id", orderId);
      await admin.from("orders").delete().eq("id", orderId);
    }
    for (const key of cleanup.membershipIds) {
      const [collectionId, cakeId] = key.split("::");
      await admin
        .from("collection_cakes")
        .delete()
        .eq("collection_id", collectionId ?? "")
        .eq("library_cake_id", cakeId ?? "");
    }
    if (cleanup.scheduleIds.length > 0) {
      await admin
        .from("library_cake_size_prices")
        .delete()
        .in("id", cleanup.scheduleIds);
    }
    if (cleanup.sizeIds.length > 0) {
      await admin.from("library_cake_sizes").delete().in("id", cleanup.sizeIds);
    }
    await admin.from("library_cakes").delete().eq("id", cleanup.cakeId);
  }
})().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
