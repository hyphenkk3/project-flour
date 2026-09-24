/**
 * Live DEV: registered RM10 expiry is authoritative; form expiry cannot
 * make an expired managed card valid. Owner Override must be explicit.
 *
 * Run: npx --cache /tmp/npm-cache-voucher --yes tsx scripts/test-rm10-registered-expiry-live.ts
 * DEV only. Cleans up disposable vouchers/orders.
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

const SIG = `RM10EXP-${Date.now().toString().slice(-8)}`;
const PRODUCT_ORDER_ID = "7e9779ac-152b-42e0-8002-34ba8e9b11b5";

function singaporeYmd(value = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

  const today = singaporeYmd();
  const futureExpiry = addCalendarDays(today, 40);
  const formFutureExpiry = addCalendarDays(today, 15);
  const originalExpiry = "2026-07-31";
  const requested = ["3001", "3002", "3003", "3004", "3005"];
  const { data: existing } = await admin
    .from("physical_discount_vouchers")
    .select("voucher_number_normalized")
    .in("voucher_number_normalized", requested);
  const occupied = new Set(
    (existing ?? []).map((row) => String(row.voucher_number_normalized)),
  );
  const numbers = occupied.size
    ? ["93001", "93002", "93003", "93004", "93005"]
    : requested;
  const [nA, nB, nC, nD, nF] = numbers;

  const orderIds: string[] = [];
  const voucherIds: string[] = [];
  const staffIdsToDelete: string[] = [];
  const authUserIdsToDelete: string[] = [];

  async function cleanupOrder(orderId: string) {
    await admin.from("order_timeline_events").delete().eq("order_id", orderId);
    await admin
      .from("physical_discount_voucher_redemptions")
      .delete()
      .eq("order_id", orderId);
    await admin.from("order_adjustments").delete().eq("order_id", orderId);
    await admin.from("order_items").delete().eq("order_id", orderId);
    await admin.from("orders").delete().eq("id", orderId);
  }

  async function registerCard(number: string, expiry: string) {
    const { data, error } = await admin
      .from("physical_discount_vouchers")
      .insert({
        voucher_number: number,
        voucher_number_normalized: number,
        expiry_date: expiry,
        status: "unredeemed",
        library_managed: true,
      })
      .select("id, expiry_date, library_managed")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? `failed to register ${number}`);
    }
    voucherIds.push(data.id);
    return data;
  }

  try {
    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .eq("code", "owner")
      .maybeSingle();
    if (!ownerRole?.id) throw new Error("owner role missing");
    const { data: ownerStaff } = await admin
      .from("staff_profiles")
      .select("id")
      .eq("role_id", ownerRole.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (!ownerStaff?.id) throw new Error("No owner staff");
    const ownerId = ownerStaff.id as string;

    const { data: coRole } = await admin
      .from("roles")
      .select("id")
      .eq("code", "customer_operations")
      .maybeSingle();
    if (!coRole?.id) throw new Error("CO role missing");
    const email = `rm10exp-co-${Date.now()}@whitebird.dev`;
    const { data: authCreated, error: authErr } =
      await admin.auth.admin.createUser({
        email,
        password: `TmpRm10_${Date.now()}!`,
        email_confirm: true,
      });
    if (authErr || !authCreated.user?.id) {
      throw new Error(authErr?.message ?? "Failed CO auth");
    }
    authUserIdsToDelete.push(authCreated.user.id);
    const { data: coProfile, error: coErr } = await admin
      .from("staff_profiles")
      .insert({
        auth_user_id: authCreated.user.id,
        username: `rm10e${Date.now().toString().slice(-6)}`.slice(0, 24),
        email,
        display_name: `${SIG} CO`,
        role_id: coRole.id,
        is_active: true,
      })
      .select("id")
      .single();
    if (coErr || !coProfile?.id) {
      throw new Error(coErr?.message ?? "Failed CO profile");
    }
    staffIdsToDelete.push(coProfile.id);
    const coId = coProfile.id as string;

    const { data: sizes } = await admin
      .from("library_cake_sizes")
      .select("id, cake_id, price, label")
      .limit(40);
    let size6 = sizes?.[0];
    for (const candidate of sizes ?? []) {
      const { data: cake } = await admin
        .from("library_cakes")
        .select("id")
        .eq("id", candidate.cake_id)
        .in("status", ["active", "seasonal"])
        .maybeSingle();
      if (!cake) continue;
      if (String(candidate.label ?? "").startsWith('6"')) {
        size6 = candidate;
        break;
      }
    }
    if (!size6) throw new Error("No 6\" cake size");

    async function createOrder(name: string) {
      const { data, error } = await admin.rpc("create_staff_guest_preorder", {
        p_actor_staff_id: ownerId,
        p_customer_name: name,
        p_phone: "0190000222",
        p_email: null,
        p_order_source: "whatsapp",
        p_crew_order: false,
        p_pickup_date: formFutureExpiry,
        p_pickup_time: "16:00:00",
        p_pickup_instruction: null,
        p_items: [
          { cake_id: size6!.cake_id, cake_size_id: size6!.id, quantity: 1 },
        ],
        p_complimentary: [],
        p_include_receipt: false,
        p_needs_bakery_attention: false,
        p_bakery_attention_note: null,
        p_customer_notes: null,
        p_internal_notes: SIG,
        p_fulfilment_method: "pickup",
        p_delivery: null,
      });
      if (error || !data?.id) {
        throw new Error(error?.message ?? "create failed");
      }
      const id = data.id as string;
      assert.notEqual(id, PRODUCT_ORDER_ID);
      orderIds.push(id);
      return id;
    }

    async function redeem(input: {
      orderId: string;
      actorId: string;
      voucher: string;
      expiry: string;
      override: boolean;
    }) {
      return admin.rpc("redeem_rm10_physical_voucher_for_guest_order", {
        p_order_id: input.orderId,
        p_actor_staff_id: input.actorId,
        p_voucher_number: input.voucher,
        p_expiry_date: input.expiry,
        p_owner_override: input.override,
        p_override_reason: input.override ? `${SIG} owner override` : null,
      });
    }

    async function readCard(number: string) {
      const { data, error } = await admin
        .from("physical_discount_vouchers")
        .select("id, expiry_date, status, library_managed")
        .eq("voucher_number_normalized", number)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }

    async function rm10Count(orderId: string) {
      const { data, error } = await admin
        .from("order_adjustments")
        .select("id, metadata, status")
        .eq("order_id", orderId)
        .eq("code", "rm10_physical_card")
        .eq("status", "active");
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    // CASE A — unexpired managed voucher
    await registerCard(nA, futureExpiry);
    const orderA = await createOrder(`${SIG} A`);
    const redeemA = await redeem({
      orderId: orderA,
      actorId: ownerId,
      voucher: nA,
      expiry: formFutureExpiry,
      override: false,
    });
    assert.equal(redeemA.error, null, redeemA.error?.message);
    const cardA = await readCard(nA);
    assert.equal(cardA?.expiry_date, futureExpiry);
    assert.equal(cardA?.status, "redeemed");
    const adjA = await rm10Count(orderA);
    assert.equal(adjA.length, 1);
    assert.equal(adjA[0]?.metadata?.owner_override, false);
    console.log("PASS  CASE A unexpired managed redeem, no override");

    // CASE B + C + E — expired managed + future form expiry, no override
    await registerCard(nB, originalExpiry);
    const orderB = await createOrder(`${SIG} B`);
    const redeemB = await redeem({
      orderId: orderB,
      actorId: ownerId,
      voucher: nB,
      expiry: formFutureExpiry,
      override: false,
    });
    assert.ok(redeemB.error, "expired managed must reject without override");
    assert.match(
      redeemB.error?.message ?? "",
      /expired|after voucher expiry/i,
    );
    const cardB = await readCard(nB);
    assert.equal(cardB?.expiry_date, originalExpiry);
    assert.equal(cardB?.status, "unredeemed");
    assert.equal((await rm10Count(orderB)).length, 0);
    console.log("PASS  CASE B/E future form expiry cannot validate expired card");

    await registerCard(nC, originalExpiry);
    const orderC = await createOrder(`${SIG} C`);
    const redeemC = await redeem({
      orderId: orderC,
      actorId: coId,
      voucher: nC,
      expiry: formFutureExpiry,
      override: false,
    });
    assert.ok(redeemC.error, "CO cannot redeem expired managed card");
    const redeemCOverride = await redeem({
      orderId: orderC,
      actorId: coId,
      voucher: nC,
      expiry: formFutureExpiry,
      override: true,
    });
    assert.ok(redeemCOverride.error, "CO cannot Owner Override");
    const cardC = await readCard(nC);
    assert.equal(cardC?.expiry_date, originalExpiry);
    assert.equal(cardC?.status, "unredeemed");
    assert.equal((await rm10Count(orderC)).length, 0);
    console.log("PASS  CASE C unauthorized role rejected");

    // CASE D — expired managed WITH Owner Override
    await registerCard(nD, originalExpiry);
    const orderD = await createOrder(`${SIG} D`);
    const redeemDSilent = await redeem({
      orderId: orderD,
      actorId: ownerId,
      voucher: nD,
      expiry: formFutureExpiry,
      override: false,
    });
    assert.ok(redeemDSilent.error, "Owner submit without override must fail");
    const redeemD = await redeem({
      orderId: orderD,
      actorId: ownerId,
      voucher: nD,
      expiry: formFutureExpiry,
      override: true,
    });
    assert.equal(redeemD.error, null, redeemD.error?.message);
    const cardD = await readCard(nD);
    assert.equal(cardD?.expiry_date, originalExpiry);
    assert.equal(cardD?.status, "redeemed");
    const adjD = await rm10Count(orderD);
    assert.equal(adjD.length, 1);
    assert.equal(adjD[0]?.metadata?.owner_override, true);
    assert.equal(adjD[0]?.metadata?.registered_expiry_date, originalExpiry);
    const { data: redemptionD } = await admin
      .from("physical_discount_voucher_redemptions")
      .select("is_owner_override, expiry_date")
      .eq("order_id", orderD)
      .maybeSingle();
    assert.equal(redemptionD?.is_owner_override, true);
    assert.equal(redemptionD?.expiry_date, formFutureExpiry);
    console.log("PASS  CASE D explicit Owner Override recorded, original expiry kept");

    // CASE F — failed then successful attempts do not mutate library expiry
    await registerCard(nF, originalExpiry);
    const orderF = await createOrder(`${SIG} F`);
    await redeem({
      orderId: orderF,
      actorId: ownerId,
      voucher: nF,
      expiry: formFutureExpiry,
      override: false,
    });
    const cardF = await readCard(nF);
    assert.equal(cardF?.expiry_date, originalExpiry);
    console.log("PASS  CASE F form expiry did not mutate library expiry");

    // CASE G — historical unregistered still uses form expiry
    const histNumber = `${Date.now().toString().slice(-7)}`;
    const orderG = await createOrder(`${SIG} G`);
    const redeemG = await redeem({
      orderId: orderG,
      actorId: ownerId,
      voucher: histNumber,
      expiry: futureExpiry,
      override: false,
    });
    assert.equal(redeemG.error, null, redeemG.error?.message);
    const { data: hist } = await admin
      .from("physical_discount_vouchers")
      .select("id, library_managed, expiry_date")
      .eq("voucher_number_normalized", histNumber)
      .maybeSingle();
    if (hist?.id) voucherIds.push(hist.id);
    assert.equal(hist?.library_managed, false);
    assert.equal(hist?.expiry_date, futureExpiry);
    console.log("PASS  CASE G historical/unregistered path preserved");

    console.log(`test-rm10-registered-expiry-live: ok (${numbers.join(", ")})`);
  } finally {
    for (const orderId of orderIds) {
      await cleanupOrder(orderId);
    }
    if (voucherIds.length > 0) {
      await admin
        .from("physical_discount_vouchers")
        .delete()
        .in("id", voucherIds);
    }
    for (const staffId of staffIdsToDelete) {
      await admin.from("staff_profiles").delete().eq("id", staffId);
    }
    for (const authId of authUserIdsToDelete) {
      await admin.auth.admin.deleteUser(authId);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
