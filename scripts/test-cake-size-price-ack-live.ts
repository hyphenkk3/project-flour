/**
 * Phase 2A live stale-price protection for submit_guest_preorder.
 * Run: npx tsx scripts/test-cake-size-price-ack-live.ts
 *
 * Disposable cake/order rows only. Does not modify production, Fresh Picks, or EXTRA.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CAKE_PRICE_ACK_STALE_MESSAGE } from "@/engines/orders/cake-size-price-ack";

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

function ackPayload(
  pickupDate: string,
  sizeId: string,
  quoted: number,
  acknowledged: number,
) {
  return {
    pickup_date: pickupDate,
    lines: [
      {
        cake_size_id: sizeId,
        quoted_unit_price: quoted,
        acknowledged_unit_price: acknowledged,
      },
    ],
  };
}

void (async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log("SKIP live cake size price ack (missing Supabase env)");
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
  });
  if (
    probeError &&
    /Could not find the function|schema cache|p_price_ack/i.test(
      probeError.message,
    ) &&
    /Could not find the function|schema cache/i.test(probeError.message)
  ) {
    console.log("SKIP live cake size price ack (DEV function not updated yet)");
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
      name: `Pricing Phase2A ${stamp}`,
      category_id: category.id,
      status: "active",
      description: "Disposable Phase 2A pricing cake",
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

  try {
    const { data: size6, error: size6Error } = await admin
      .from("library_cake_sizes")
      .insert({
        cake_id: cake.id,
        label: '6"',
        price: 120,
        sort_order: 1,
        preorder_days: 2,
      })
      .select("id")
      .single();
    if (size6Error || !size6?.id) {
      throw new Error(size6Error?.message ?? "Failed to insert 6 inch");
    }
    cleanup.sizeIds.push(size6.id);

    const { data: octSchedule, error: octError } = await admin
      .from("library_cake_size_prices")
      .insert({
        cake_size_id: size6.id,
        price: 130,
        effective_from: "2026-10-01",
        effective_to: "2026-10-31",
      })
      .select("id")
      .single();
    if (octError || !octSchedule?.id) {
      throw new Error(octError?.message ?? "Failed October schedule");
    }
    cleanup.scheduleIds.push(octSchedule.id);

    const { data: collection } = await admin.rpc(
      "storefront_collection_for_pickup_date",
      { p_pickup_date: pickupDate },
    );
    if (!collection?.id) {
      console.log(
        "SKIP live cake size price ack (no published catalogue for 2026-10-15)",
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
      p_customer_name: `Pricing ack ${stamp}`,
      p_phone: "0190000088",
      p_email: null,
      p_pickup_date: pickupDate,
      p_pickup_time: "16:00:00",
      p_notes: "phase2a-price-ack",
      p_items: [{ cake_id: cake.id, cake_size_id: size6.id, quantity: 1 }],
      p_email_submission_receipt_requested: false,
    };

    // Missing ack while quoted differs from applicable.
    const { data: missingOrder, error: missingErr } = await admin.rpc(
      "submit_guest_preorder",
      {
        ...guestArgs,
        p_price_ack: ackPayload(pickupDate, size6.id, 120, 120),
      },
    );
    if (missingOrder?.id) cleanup.orderIds.push(missingOrder.id);
    assert.ok(missingErr, "stale/missing applicable ack must reject");
    assert.match(
      missingErr?.message ?? "",
      /prices for your selected pickup date have changed/i,
    );
    assert.equal(missingOrder?.id, undefined);

    // Wrong pickup date in acknowledgement.
    const { data: dateOrder, error: dateErr } = await admin.rpc(
      "submit_guest_preorder",
      {
        ...guestArgs,
        p_price_ack: ackPayload("2026-09-25", size6.id, 120, 130),
      },
    );
    if (dateOrder?.id) cleanup.orderIds.push(dateOrder.id);
    assert.ok(dateErr, "mismatched ack pickup date must reject");
    assert.equal(dateOrder?.id, undefined);

    // TEST I — client fake price is not the charge source; valid ack charges 130.
    const { data: okOrder, error: okErr } = await admin.rpc(
      "submit_guest_preorder",
      {
        ...guestArgs,
        p_items: [
          {
            cake_id: cake.id,
            cake_size_id: size6.id,
            quantity: 1,
            unit_price: 1,
          },
        ],
        p_price_ack: ackPayload(pickupDate, size6.id, 120, 130),
      },
    );
    if (okErr) throw new Error(okErr.message);
    if (okOrder?.id) cleanup.orderIds.push(okOrder.id);
    const { data: okItems } = await admin
      .from("order_items")
      .select("unit_price")
      .eq("order_id", okOrder.id);
    assert.equal(Number(okItems?.[0]?.unit_price), 130);

    // TEST J — historical snapshot stays 130 after schedule change.
    const { error: bumpErr } = await admin
      .from("library_cake_size_prices")
      .update({ price: 135 })
      .eq("id", octSchedule.id);
    if (bumpErr) throw new Error(bumpErr.message);
    const { data: histItems } = await admin
      .from("order_items")
      .select("unit_price")
      .eq("order_id", okOrder.id);
    assert.equal(Number(histItems?.[0]?.unit_price), 130);

    // TEST H — stale acknowledgement of RM130 after server price became RM135.
    const { data: staleOrder, error: staleErr } = await admin.rpc(
      "submit_guest_preorder",
      {
        ...guestArgs,
        p_customer_name: `Pricing stale ${stamp}`,
        p_price_ack: ackPayload(pickupDate, size6.id, 120, 130),
      },
    );
    if (staleOrder?.id) cleanup.orderIds.push(staleOrder.id);
    assert.ok(staleErr, "stale RM130 acknowledgement must reject");
    assert.match(
      staleErr?.message ?? "",
      /prices for your selected pickup date have changed/i,
    );
    assert.equal(staleOrder?.id, undefined);
    assert.match(CAKE_PRICE_ACK_STALE_MESSAGE, /changed/);

    const { data: freshOrder, error: freshErr } = await admin.rpc(
      "submit_guest_preorder",
      {
        ...guestArgs,
        p_customer_name: `Pricing fresh ${stamp}`,
        p_price_ack: ackPayload(pickupDate, size6.id, 120, 135),
      },
    );
    if (freshErr) throw new Error(freshErr.message);
    if (freshOrder?.id) cleanup.orderIds.push(freshOrder.id);
    const { data: freshItems } = await admin
      .from("order_items")
      .select("unit_price")
      .eq("order_id", freshOrder.id);
    assert.equal(Number(freshItems?.[0]?.unit_price), 135);

    console.log("PASS cake size price acknowledgement (live)");
  } finally {
    for (const orderId of cleanup.orderIds) {
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
