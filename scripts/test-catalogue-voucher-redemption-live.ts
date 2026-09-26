/**
 * Live DEV probe for catalogue voucher redemption controls.
 * Run: npx tsx scripts/test-catalogue-voucher-redemption-live.ts
 * DEV only. Cleans up disposable voucher/orders it creates.
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

  const { error: tableError } = await admin
    .from("catalogue_voucher_redemptions")
    .select("id")
    .limit(1);
  if (tableError) {
    console.log(
      "SKIP live DB (apply supabase/migrations/20260926120000_catalogue_voucher_redemption_controls.sql).",
    );
    process.exit(0);
  }

  const today = singaporeYmd();
  const stamp = Date.now().toString().slice(-8);
  const code = `CATRED-${stamp}`;
  const created: {
    voucherIds: string[];
    orderIds: string[];
  } = { voucherIds: [], orderIds: [] };

  try {
    const { data: voucher, error: voucherError } = await admin
      .from("library_vouchers")
      .insert({
        code,
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

    const listed = await admin.rpc("list_public_catalogue_vouchers");
    if (listed.error) throw new Error(listed.error.message);
    const publicRow = (
      listed.data as Array<Record<string, unknown>> | null
    )?.find((row) => row.code === code);
    assert.ok(publicRow, "limited voucher should be discoverable while unused");
    assert.equal(
      Object.prototype.hasOwnProperty.call(publicRow ?? {}, "redemption_limit"),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(publicRow ?? {}, "remaining"),
      false,
    );

    const { data: cake } = await admin
      .from("library_cake_sizes")
      .select("id, cake_id, label, price, library_cakes(name)")
      .gt("price", 5)
      .limit(1)
      .maybeSingle();
    if (!cake) {
      console.log("SKIP live apply (no cake size available).");
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
      console.log("SKIP live apply (no cake name available).");
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
          guest_phone: "0190000999",
          fulfilment_method: "pickup",
          pickup_date: today,
          pickup_time: "15:00:00",
          status: "submitted",
          payment_status: "unpaid",
          customer_notes: code,
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

    const firstOrder = await createOrder(`${code} first`);
    const secondOrder = await createOrder(`${code} second`);

    const firstApply = await admin.rpc("apply_catalogue_voucher_to_guest_order", {
      p_order_id: firstOrder,
      p_voucher_id: voucher.id,
      p_actor_staff_id: null,
    });
    if (firstApply.error) throw new Error(firstApply.error.message);

    const { data: activeAfterFirst } = await admin
      .from("catalogue_voucher_redemptions")
      .select("id, status")
      .eq("voucher_id", voucher.id)
      .eq("status", "redeemed");
    assert.equal(activeAfterFirst?.length, 1);

    const exhaustedList = await admin.rpc("list_public_catalogue_vouchers");
    assert.equal(
      (exhaustedList.data as Array<{ code?: string }> | null)?.some(
        (row) => row.code === code,
      ),
      false,
      "exhausted voucher must leave the public list",
    );

    const secondApply = await admin.rpc("apply_catalogue_voucher_to_guest_order", {
      p_order_id: secondOrder,
      p_voucher_id: voucher.id,
      p_actor_staff_id: null,
    });
    assert.match(
      secondApply.error?.message ?? "",
      /no longer available/i,
    );

    const { error: cancelError } = await admin
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", firstOrder);
    if (cancelError) throw new Error(cancelError.message);

    const { data: afterCancel } = await admin
      .from("catalogue_voucher_redemptions")
      .select("status, released_at, release_reason")
      .eq("voucher_id", voucher.id)
      .eq("order_id", firstOrder)
      .maybeSingle();
    assert.equal(afterCancel?.status, "released");
    assert.ok(afterCancel?.released_at);
    assert.equal(afterCancel?.release_reason, "order_cancelled");

    const { data: firstRelease } = await admin.rpc(
      "release_catalogue_voucher_redemptions_for_order",
      {
        p_order_id: firstOrder,
        p_actor_staff_id: null,
        p_reason: "order_cancelled",
      },
    );
    assert.equal(firstRelease, 0);

    const restoredList = await admin.rpc("list_public_catalogue_vouchers");
    assert.equal(
      (restoredList.data as Array<{ code?: string }> | null)?.some(
        (row) => row.code === code,
      ),
      true,
      "released slot must restore public discovery",
    );

    const retryApply = await admin.rpc("apply_catalogue_voucher_to_guest_order", {
      p_order_id: secondOrder,
      p_voucher_id: voucher.id,
      p_actor_staff_id: null,
    });
    if (retryApply.error) throw new Error(retryApply.error.message);

    const { data: history } = await admin
      .from("catalogue_voucher_redemptions")
      .select("id, status, order_id")
      .eq("voucher_id", voucher.id)
      .order("redeemed_at", { ascending: false });
    assert.equal(history?.length, 2);
    assert.equal(history?.filter((row) => row.status === "released").length, 1);
    assert.equal(history?.filter((row) => row.status === "redeemed").length, 1);

    const { data: rollbackVoucher, error: rollbackVoucherError } = await admin
      .from("library_vouchers")
      .insert({
        code: `${code}-RB`,
        voucher_type: "fixed_amount",
        value: 5,
        valid_from: today,
        valid_until: today,
        status: "active",
        redemption_limit: 1,
      })
      .select("id")
      .single();
    if (rollbackVoucherError || !rollbackVoucher) {
      throw new Error(rollbackVoucherError?.message ?? "Could not create rollback voucher.");
    }
    created.voucherIds.push(rollbackVoucher.id);

    const { data: bareNumber, error: bareNumberError } = await admin.rpc(
      "allocate_order_number",
    );
    if (bareNumberError || !bareNumber) {
      throw new Error(bareNumberError?.message ?? "Could not allocate rollback order number.");
    }
    const { data: bareOrder, error: bareOrderError } = await admin
      .from("orders")
      .insert({
        order_number: bareNumber,
        customer_id: null,
        guest_name: `${code} rollback`,
        guest_phone: "0190000999",
        fulfilment_method: "pickup",
        pickup_date: today,
        pickup_time: "15:00:00",
        status: "submitted",
        payment_status: "unpaid",
        customer_notes: code,
        extra_stock_id: null,
        order_source: "customer_website",
        include_receipt: false,
      })
      .select("id")
      .single();
    if (bareOrderError || !bareOrder) {
      throw new Error(bareOrderError?.message ?? "Could not create rollback order.");
    }
    created.orderIds.push(bareOrder.id);
    const rollbackApply = await admin.rpc(
      "apply_catalogue_voucher_to_guest_order",
      {
        p_order_id: bareOrder.id,
        p_voucher_id: rollbackVoucher.id,
        p_actor_staff_id: null,
      },
    );
    assert.match(rollbackApply.error?.message ?? "", /does not produce a discount/i);
    const { data: rollbackRows } = await admin
      .from("catalogue_voucher_redemptions")
      .select("id")
      .eq("voucher_id", rollbackVoucher.id);
    assert.equal(rollbackRows?.length, 0);

    const { data: unlimitedVoucher, error: unlimitedError } = await admin
      .from("library_vouchers")
      .insert({
        code: `${code}-UNL`,
        voucher_type: "fixed_amount",
        value: 5,
        valid_from: today,
        valid_until: today,
        status: "active",
        redemption_limit: null,
      })
      .select("id")
      .single();
    if (unlimitedError || !unlimitedVoucher) {
      throw new Error(unlimitedError?.message ?? "Could not create unlimited voucher.");
    }
    created.voucherIds.push(unlimitedVoucher.id);

    const unlimitedOrder = await createOrder(`${code} unlimited`);
    const unlimitedApply = await admin.rpc(
      "apply_catalogue_voucher_to_guest_order",
      {
        p_order_id: unlimitedOrder,
        p_voucher_id: unlimitedVoucher.id,
        p_actor_staff_id: null,
      },
    );
    if (unlimitedApply.error) throw new Error(unlimitedApply.error.message);

    const stackApply = await admin.rpc("apply_catalogue_voucher_to_guest_order", {
      p_order_id: unlimitedOrder,
      p_voucher_id: voucher.id,
      p_actor_staff_id: null,
    });
    assert.match(
      stackApply.error?.message ?? "",
      /already applied/i,
    );

    const { data: raceVoucher, error: raceError } = await admin
      .from("library_vouchers")
      .insert({
        code: `${code}-RACE`,
        voucher_type: "fixed_amount",
        value: 5,
        valid_from: today,
        valid_until: today,
        status: "active",
        redemption_limit: 1,
      })
      .select("id")
      .single();
    if (raceError || !raceVoucher) {
      throw new Error(raceError?.message ?? "Could not create race voucher.");
    }
    created.voucherIds.push(raceVoucher.id);
    const raceFirst = await createOrder(`${code} race a`);
    const raceSecond = await createOrder(`${code} race b`);
    const [raceA, raceB] = await Promise.all([
      admin.rpc("apply_catalogue_voucher_to_guest_order", {
        p_order_id: raceFirst,
        p_voucher_id: raceVoucher.id,
        p_actor_staff_id: null,
      }),
      admin.rpc("apply_catalogue_voucher_to_guest_order", {
        p_order_id: raceSecond,
        p_voucher_id: raceVoucher.id,
        p_actor_staff_id: null,
      }),
    ]);
    const raceWins = [raceA, raceB].filter((row) => !row.error).length;
    const raceLosses = [raceA, raceB].filter((row) =>
      /no longer available/i.test(row.error?.message ?? ""),
    ).length;
    assert.equal(raceWins, 1, "only one concurrent apply may consume the last slot");
    assert.equal(raceLosses, 1, "the losing concurrent apply must be rejected");

    console.log("catalogue voucher redemption live DEV probe passed");
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
