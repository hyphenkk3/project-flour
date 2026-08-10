/**
 * M4-P1 Slice 1 — database verification (paid add-ons persistence + amount due).
 *
 * Prerequisites:
 *   apply 20260810090000_m4_p1_paid_order_addons.sql
 *   apply 20260810093000_m4_p1_revoke_internal_paid_addon_sync.sql
 *   apply 20260810110000_m4_p1_paid_addon_per_card_messages.sql
 *
 * Usage: node scripts/test-m4-p1-slice1-paid-addons.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.error(`FAIL  ${label}`);
  }
}

function moneyEq(a, b) {
  return Number(a).toFixed(2) === Number(b).toFixed(2);
}

async function rpc(name, args) {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function getStaffId() {
  const { data, error } = await admin
    .from("staff_profiles")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (error || !data?.id) {
    throw new Error("No staff_profiles row for actor (run seed:dev)");
  }
  return data.id;
}

async function getCakeSize(unitPrice) {
  const { data: sizes, error } = await admin
    .from("library_cake_sizes")
    .select("id, cake_id, label, price")
    .eq("price", unitPrice)
    .limit(5);
  if (error) throw error;
  if (!sizes?.length) {
    // Fall back: any size, we will override unit_price via direct insert for fixture orders
    const { data: anySize, error: anyErr } = await admin
      .from("library_cake_sizes")
      .select("id, cake_id, label, price")
      .limit(1)
      .maybeSingle();
    if (anyErr || !anySize) throw new Error("No library_cake_sizes available");
    return anySize;
  }
  const { data: cake } = await admin
    .from("library_cakes")
    .select("id, name, status")
    .eq("id", sizes[0].cake_id)
    .in("status", ["active", "seasonal"])
    .maybeSingle();
  if (!cake) {
    // Prefer active cake with matching price
    for (const size of sizes) {
      const { data: c } = await admin
        .from("library_cakes")
        .select("id, name, status")
        .eq("id", size.cake_id)
        .in("status", ["active", "seasonal"])
        .maybeSingle();
      if (c) return { ...size, cakeName: c.name };
    }
  }
  return { ...sizes[0], cakeName: cake?.name ?? "Cake" };
}

async function createFixtureOrder(input) {
  const staffId = await getStaffId();
  const size = await getCakeSize(input.cakeUnitPrice);
  // Staff create snapshots Library price — for exact cake subtotals we may need
  // to rewrite order_items.unit_price after create when Library price ≠ target.
  const order = await rpc("create_staff_guest_preorder", {
    p_actor_staff_id: staffId,
    p_customer_name: input.customerName ?? `M4P1 Slice1 ${Date.now()}`,
    p_phone: null,
    p_email: null,
    p_order_source: "whatsapp",
    p_crew_order: false,
    p_pickup_date: "2026-08-20",
    p_pickup_time: "15:00:00",
    p_pickup_instruction: null,
    p_items: [
      {
        cake_id: size.cake_id,
        cake_size_id: size.id,
        quantity: input.cakeQuantity ?? 1,
      },
    ],
    p_complimentary: [],
    p_include_receipt: false,
    p_needs_bakery_attention: false,
    p_bakery_attention_note: null,
    p_customer_notes: null,
    p_internal_notes: "m4-p1-slice1-test",
    p_paid_addons: input.paidAddons ?? [],
  });

  if (Number(size.price) !== Number(input.cakeUnitPrice)) {
    const { error } = await admin
      .from("order_items")
      .update({
        unit_price: input.cakeUnitPrice,
        cake_name: size.cakeName ?? "Cake",
        size_label: size.label,
      })
      .eq("order_id", order.id);
    if (error) throw error;
  }

  return order;
}

async function insertAdjustment(orderId, code, label, amount) {
  const staffId = await getStaffId();
  const { error } = await admin.from("order_adjustments").insert({
    order_id: orderId,
    kind: "promotion",
    code,
    label,
    amount,
    reason: "m4-p1-slice1-test",
    metadata: {},
    status: "active",
    created_by: staffId,
  });
  if (error) throw error;
}

async function cleanupOrder(orderId) {
  // Cascade removes items/addons/adjustments/timeline via FKs where configured.
  await admin.from("order_adjustments").delete().eq("order_id", orderId);
  await admin.from("order_timeline_events").delete().eq("order_id", orderId);
  await admin.from("orders").delete().eq("id", orderId);
}

async function main() {
  console.log("M4-P1 Slice 1 verification\n");

  // A. Catalog
  const { data: catalog, error: catalogError } = await admin
    .from("paid_addon_types")
    .select(
      "code, name, unit_price, financial_shorthand, is_active, sort_order, max_quantity",
    )
    .in("code", ["birthday_card", "wishing_card"])
    .order("sort_order");
  if (catalogError) {
    console.error(
      "Cannot read paid_addon_types — has migration been applied?\n",
      catalogError.message,
    );
    process.exit(1);
  }
  const bc = catalog?.find((r) => r.code === "birthday_card");
  const wc = catalog?.find((r) => r.code === "wishing_card");
  assert(bc?.name === "Birthday Card" && moneyEq(bc.unit_price, 3) && bc.financial_shorthand === "BC", "A. Birthday Card = RM3 / BC");
  assert(wc?.name === "Wishing Card" && moneyEq(wc.unit_price, 3) && wc.financial_shorthand === "WC", "A. Wishing Card = RM3 / WC");
  assert(Number(bc?.max_quantity) === 3, "A. Birthday Card max_quantity = 3");
  assert(Number(wc?.max_quantity) === 3, "A. Wishing Card max_quantity = 3");

  const createdIds = [];

  try {
    // B. Snapshot authority + per-card messages
    const orderB = await createFixtureOrder({
      cakeUnitPrice: 125,
      paidAddons: [
        {
          code: "birthday_card",
          quantity: 1,
          messages: ["  Happy Birthday  "],
        },
      ],
    });
    createdIds.push(orderB.id);

    const { data: linesB1 } = await admin
      .from("order_paid_addons")
      .select("*")
      .eq("order_id", orderB.id);
    const lineB = linesB1?.[0];
    assert(lineB?.code === "birthday_card" && moneyEq(lineB.unit_price, 3) && lineB.financial_shorthand === "BC", "B. new BC snapshots RM3/BC");
    assert(lineB?.written_message == null, "B. parent written_message cleared (child slots own messages)");

    const { data: msgsB1 } = await admin
      .from("order_paid_addon_messages")
      .select("card_index, written_message")
      .eq("order_paid_addon_id", lineB.id)
      .order("card_index");
    assert(
      msgsB1?.length === 1 && msgsB1[0].written_message === "Happy Birthday",
      "B. Card 1 message trimmed into child slot",
    );

    // Client cannot invent RM1 via sync (ignored — server retains or catalogs)
    await rpc("sync_guest_order_paid_addons", {
      p_order_id: orderB.id,
      p_paid_addons: [
        {
          code: "birthday_card",
          quantity: 1,
          unit_price: 1,
          name: "Fake",
          financial_shorthand: "XX",
          messages: ["Kept"],
        },
      ],
    });
    const { data: linesB2 } = await admin
      .from("order_paid_addons")
      .select("*")
      .eq("order_id", orderB.id);
    const retained = linesB2?.[0];
    assert(
      moneyEq(retained?.unit_price, 3) &&
        retained?.name === "Birthday Card" &&
        retained?.financial_shorthand === "BC",
      "B. retained BC preserves snapshot (client price/name/shorthand ignored)",
    );
    const { data: msgsB2 } = await admin
      .from("order_paid_addon_messages")
      .select("written_message")
      .eq("order_paid_addon_id", retained.id)
      .eq("card_index", 1)
      .maybeSingle();
    assert(msgsB2?.written_message === "Kept", "B. Card 1 message can change");

    await rpc("sync_guest_order_paid_addons", {
      p_order_id: orderB.id,
      p_paid_addons: [
        { code: "birthday_card", quantity: 2, messages: ["Amy", "   "] },
      ],
    });
    const { data: linesB3 } = await admin
      .from("order_paid_addons")
      .select("*")
      .eq("order_id", orderB.id);
    assert(linesB3?.[0]?.quantity === 2, "B. quantity can change");
    const { data: msgsB3 } = await admin
      .from("order_paid_addon_messages")
      .select("card_index, written_message")
      .eq("order_paid_addon_id", linesB3[0].id)
      .order("card_index");
    assert(msgsB3?.length === 2, "B. qty 2 creates two message slots");
    assert(
      msgsB3[0].written_message === "Amy" && msgsB3[1].written_message === null,
      "B. blank Card 2 message normalizes null; Card 1 preserved",
    );

    // Qty 3 then reduce to 1 — higher slots deleted; increase does not resurrect
    await rpc("sync_guest_order_paid_addons", {
      p_order_id: orderB.id,
      p_paid_addons: [
        {
          code: "birthday_card",
          quantity: 3,
          messages: ["Amy", "Mum", "Dad"],
        },
      ],
    });
    await rpc("sync_guest_order_paid_addons", {
      p_order_id: orderB.id,
      p_paid_addons: [
        { code: "birthday_card", quantity: 1, messages: ["Amy"] },
      ],
    });
    const { data: msgsB4 } = await admin
      .from("order_paid_addon_messages")
      .select("card_index, written_message")
      .eq("order_paid_addon_id", linesB3[0].id)
      .order("card_index");
    assert(
      msgsB4?.length === 1 && msgsB4[0].written_message === "Amy",
      "B. reduce qty removes higher-index message slots",
    );
    await rpc("sync_guest_order_paid_addons", {
      p_order_id: orderB.id,
      p_paid_addons: [
        { code: "birthday_card", quantity: 2, messages: ["Amy"] },
      ],
    });
    const { data: msgsB5 } = await admin
      .from("order_paid_addon_messages")
      .select("card_index, written_message")
      .eq("order_paid_addon_id", linesB3[0].id)
      .order("card_index");
    assert(
      msgsB5?.length === 2 &&
        msgsB5[0].written_message === "Amy" &&
        msgsB5[1].written_message === null,
      "B. increase after reduce does not resurrect removed Card 2 message",
    );

    // Qty 4 rejected
    let qty4Rejected = false;
    try {
      await rpc("sync_guest_order_paid_addons", {
        p_order_id: orderB.id,
        p_paid_addons: [{ code: "birthday_card", quantity: 4, messages: [] }],
      });
    } catch {
      qty4Rejected = true;
    }
    assert(qty4Rejected, "B. BC quantity 4 rejected");

    let wcQty4Rejected = false;
    try {
      await rpc("sync_guest_order_paid_addons", {
        p_order_id: orderB.id,
        p_paid_addons: [
          { code: "birthday_card", quantity: 1, messages: ["Amy"] },
          { code: "wishing_card", quantity: 4, messages: [] },
        ],
      });
    } catch {
      wcQty4Rejected = true;
    }
    assert(wcQty4Rejected, "B. WC quantity 4 rejected");

    // Temporarily change catalog price, remove+re-add → new snapshot
    const { error: bumpErr } = await admin
      .from("paid_addon_types")
      .update({ unit_price: 4.0 })
      .eq("code", "birthday_card");
    if (bumpErr) throw bumpErr;

    await rpc("sync_guest_order_paid_addons", {
      p_order_id: orderB.id,
      p_paid_addons: [],
    });
    await rpc("sync_guest_order_paid_addons", {
      p_order_id: orderB.id,
      p_paid_addons: [{ code: "birthday_card", quantity: 1, messages: [] }],
    });
    const { data: linesB6 } = await admin
      .from("order_paid_addons")
      .select("*")
      .eq("order_id", orderB.id);
    assert(moneyEq(linesB6?.[0]?.unit_price, 4), "B. remove+re-add uses current catalog truth");

    // Restore catalog seed price
    await admin
      .from("paid_addon_types")
      .update({ unit_price: 3.0 })
      .eq("code", "birthday_card");

    // C. Add-on subtotal
    const orderC0 = await createFixtureOrder({ cakeUnitPrice: 125, paidAddons: [] });
    createdIds.push(orderC0.id);
    assert(moneyEq(await rpc("order_paid_addons_subtotal", { p_order_id: orderC0.id }), 0), "C. none = RM0");

    const orderC1 = await createFixtureOrder({
      cakeUnitPrice: 125,
      paidAddons: [{ code: "birthday_card", quantity: 1 }],
    });
    createdIds.push(orderC1.id);
    assert(moneyEq(await rpc("order_paid_addons_subtotal", { p_order_id: orderC1.id }), 3), "C. BC x1 = RM3");

    const orderC2 = await createFixtureOrder({
      cakeUnitPrice: 125,
      paidAddons: [{ code: "wishing_card", quantity: 1 }],
    });
    createdIds.push(orderC2.id);
    assert(moneyEq(await rpc("order_paid_addons_subtotal", { p_order_id: orderC2.id }), 3), "C. WC x1 = RM3");

    const orderC3 = await createFixtureOrder({
      cakeUnitPrice: 125,
      paidAddons: [
        { code: "birthday_card", quantity: 1 },
        { code: "wishing_card", quantity: 1 },
      ],
    });
    createdIds.push(orderC3.id);
    assert(moneyEq(await rpc("order_paid_addons_subtotal", { p_order_id: orderC3.id }), 6), "C. BC + WC = RM6");

    const orderC4 = await createFixtureOrder({
      cakeUnitPrice: 125,
      paidAddons: [{ code: "birthday_card", quantity: 2 }],
    });
    createdIds.push(orderC4.id);
    assert(moneyEq(await rpc("order_paid_addons_subtotal", { p_order_id: orderC4.id }), 6), "C. BC x2 = RM6");

    // D. Amount due
    const orderD1 = await createFixtureOrder({ cakeUnitPrice: 125, paidAddons: [] });
    createdIds.push(orderD1.id);
    assert(moneyEq(await rpc("order_amount_due", { p_order_id: orderD1.id }), 125), "D. RM125 cake only");

    const orderD2 = await createFixtureOrder({
      cakeUnitPrice: 125,
      paidAddons: [{ code: "birthday_card", quantity: 1 }],
    });
    createdIds.push(orderD2.id);
    assert(moneyEq(await rpc("order_amount_due", { p_order_id: orderD2.id }), 128), "D. RM125 + BC = RM128");

    const orderD3 = await createFixtureOrder({
      cakeUnitPrice: 125,
      paidAddons: [
        { code: "birthday_card", quantity: 1 },
        { code: "wishing_card", quantity: 1 },
      ],
    });
    createdIds.push(orderD3.id);
    assert(moneyEq(await rpc("order_amount_due", { p_order_id: orderD3.id }), 131), "D. RM125 + BC + WC = RM131");

    await insertAdjustment(orderD3.id, "august_promo_2026", "August Promo", -20);
    assert(moneyEq(await rpc("order_amount_due", { p_order_id: orderD3.id }), 111), "D. RM125+BC+WC-RM20 = RM111");

    const orderD4 = await createFixtureOrder({
      cakeUnitPrice: 125,
      paidAddons: [{ code: "birthday_card", quantity: 1 }],
    });
    createdIds.push(orderD4.id);
    await insertAdjustment(orderD4.id, "rm10_physical_card", "RM10 Discount Card", -10);
    assert(moneyEq(await rpc("order_amount_due", { p_order_id: orderD4.id }), 118), "D. RM125+BC-RM10 = RM118");

    // E. Existing-order regression (zero add-ons)
    const orderE1 = await createFixtureOrder({ cakeUnitPrice: 125, paidAddons: [] });
    createdIds.push(orderE1.id);
    assert(moneyEq(await rpc("order_items_subtotal", { p_order_id: orderE1.id }), 125), "E. cake subtotal unchanged helper");
    assert(moneyEq(await rpc("order_paid_addons_subtotal", { p_order_id: orderE1.id }), 0), "E. zero add-ons subtotal 0");
    assert(moneyEq(await rpc("order_amount_due", { p_order_id: orderE1.id }), 125), "E. no adjustment amountDue");

    await insertAdjustment(orderE1.id, "august_promo_2026", "August Promo", -20);
    assert(moneyEq(await rpc("order_amount_due", { p_order_id: orderE1.id }), 105), "E. August Promo amountDue");

    const orderE2 = await createFixtureOrder({ cakeUnitPrice: 125, paidAddons: [] });
    createdIds.push(orderE2.id);
    await insertAdjustment(orderE2.id, "rm10_physical_card", "RM10 Discount Card", -10);
    assert(moneyEq(await rpc("order_amount_due", { p_order_id: orderE2.id }), 115), "E. RM10 amountDue");

    // F. August eligibility base (cake-only > RM100) via order_items_subtotal
    const orderF1 = await createFixtureOrder({
      cakeUnitPrice: 99,
      paidAddons: [{ code: "birthday_card", quantity: 1 }],
    });
    createdIds.push(orderF1.id);
    const cakeF1 = await rpc("order_items_subtotal", { p_order_id: orderF1.id });
    const dueF1 = await rpc("order_amount_due", { p_order_id: orderF1.id });
    assert(moneyEq(cakeF1, 99) && Number(cakeF1) <= 100, "F. RM99 cake + BC => cake base NOT eligible");
    assert(moneyEq(dueF1, 102), "F. commercial amountDue still RM102");

    const orderF2 = await createFixtureOrder({
      cakeUnitPrice: 100,
      paidAddons: [{ code: "wishing_card", quantity: 1 }],
    });
    createdIds.push(orderF2.id);
    const cakeF2 = await rpc("order_items_subtotal", { p_order_id: orderF2.id });
    assert(moneyEq(cakeF2, 100) && Number(cakeF2) <= 100, "F. RM100 cake + WC => NOT eligible (> RM100)");

    const orderF3 = await createFixtureOrder({ cakeUnitPrice: 101, paidAddons: [] });
    createdIds.push(orderF3.id);
    const cakeF3 = await rpc("order_items_subtotal", { p_order_id: orderF3.id });
    assert(Number(cakeF3) > 100, "F. RM101 cake => eligible base");

    const orderF4 = await createFixtureOrder({
      cakeUnitPrice: 125,
      paidAddons: [
        { code: "birthday_card", quantity: 1 },
        { code: "wishing_card", quantity: 1 },
      ],
    });
    createdIds.push(orderF4.id);
    const cakeF4 = await rpc("order_items_subtotal", { p_order_id: orderF4.id });
    const addF4 = await rpc("order_paid_addons_subtotal", { p_order_id: orderF4.id });
    assert(moneyEq(cakeF4, 125) && moneyEq(addF4, 6) && Number(cakeF4) > 100, "F. RM125 cake + BC + WC eligible on RM125");

    // G. RM10 — no new eligibility; amountDue includes add-ons
    assert(moneyEq(await rpc("order_amount_due", { p_order_id: orderD4.id }), 118), "G. RM10 + BC amountDue still RM118");

    // Reject unknown / inactive
    let rejectedUnknown = false;
    try {
      await rpc("sync_guest_order_paid_addons", {
        p_order_id: orderD1.id,
        p_paid_addons: [{ code: "not_a_real_addon", quantity: 1 }],
      });
    } catch {
      rejectedUnknown = true;
    }
    assert(rejectedUnknown, "B+. unknown add-on code rejected");
  } finally {
    // Restore catalog in case of mid-test failure
    await admin
      .from("paid_addon_types")
      .update({ unit_price: 3.0 })
      .eq("code", "birthday_card");

    for (const id of createdIds) {
      try {
        await cleanupOrder(id);
      } catch {
        // best-effort cleanup
      }
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("Failures:\n" + failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
