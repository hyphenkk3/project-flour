/**
 * M4-P2 Slice 1 — database verification (fulfilment + delivery details).
 *
 * Prerequisites:
 *   apply 20260810120000_m4_p2_fulfilment_delivery_details.sql
 *   apply 20260810123000_m4_p2_revoke_anon_fulfilment_sync.sql
 *
 * Usage: node scripts/test-m4-p2-slice1-fulfilment.mjs
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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anon = anonKey
  ? createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

let passed = 0;
let failed = 0;
const failures = [];
const cleanupOrderIds = [];

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

async function rpc(name, args) {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function rpcExpectFail(name, args) {
  const { error } = await admin.rpc(name, args);
  return error;
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

async function getCakeSize() {
  const { data: sizes, error } = await admin
    .from("library_cake_sizes")
    .select("id, cake_id, price, label")
    .limit(20);
  if (error || !sizes?.length) throw new Error("No library_cake_sizes");
  for (const size of sizes) {
    const { data: cake } = await admin
      .from("library_cakes")
      .select("id, status")
      .eq("id", size.cake_id)
      .in("status", ["active", "seasonal"])
      .maybeSingle();
    if (cake) return size;
  }
  throw new Error("No active cake size");
}

function deliveryPayload(overrides = {}) {
  return {
    recipient_name: "Recipient Amy",
    recipient_phone: "0199999999",
    address_line_1: "12 Jalan Delivery",
    address_line_2: "Unit 5",
    postcode: "50450",
    city: "Kuala Lumpur",
    state: "Wilayah Persekutuan",
    recipient_notify_preference: "inform_recipient",
    ...overrides,
  };
}

async function createStaffBase(extra = {}) {
  const staffId = await getStaffId();
  const size = await getCakeSize();
  const order = await rpc("create_staff_guest_preorder", {
    p_actor_staff_id: staffId,
    p_customer_name: `M4P2 Slice1 ${Date.now()}`,
    p_phone: "0111111111",
    p_email: null,
    p_order_source: "whatsapp",
    p_crew_order: false,
    p_pickup_date: "2026-08-25",
    p_pickup_time: "15:00:00",
    p_pickup_instruction: null,
    p_items: [
      {
        cake_id: size.cake_id,
        cake_size_id: size.id,
        quantity: 1,
      },
    ],
    p_complimentary: [],
    p_include_receipt: false,
    p_needs_bakery_attention: false,
    p_bakery_attention_note: null,
    p_customer_notes: null,
    p_internal_notes: null,
    ...extra,
  });
  cleanupOrderIds.push(order.id);
  return order;
}

async function getDetails(orderId) {
  const { data, error } = await admin
    .from("order_delivery_details")
    .select("*")
    .eq("order_id", orderId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function cleanup() {
  for (const id of cleanupOrderIds) {
    await admin.from("orders").delete().eq("id", id);
  }
}

async function main() {
  console.log("M4-P2 Slice 1 verification\n");

  // A. table exists
  {
    const { error } = await admin
      .from("order_delivery_details")
      .select("order_id")
      .limit(1);
    if (error) {
      console.error(
        "\nBLOCKER: migration 20260810120000_m4_p2_fulfilment_delivery_details.sql " +
          "is not applied on the remote database.\n" +
          `PostgREST: ${error.message}\n` +
          "Apply the migration, then re-run: node scripts/test-m4-p2-slice1-fulfilment.mjs\n",
      );
      assert(false, "A. table exists");
      console.log(`\n${passed} passed, ${failed} failed`);
      process.exit(1);
    }
    assert(true, "A. table exists");
  }

  // B. expected columns (probe via insert reject / select *)
  {
    const { data, error } = await admin
      .from("order_delivery_details")
      .select(
        "order_id, recipient_name, recipient_phone, address_line_1, address_line_2, postcode, city, state, recipient_notify_preference, created_at, updated_at",
      )
      .limit(0);
    assert(!error && Array.isArray(data), "B. expected columns selectable");
  }

  // D. old-style staff create omitted P2 args → Pickup
  {
    const order = await createStaffBase({ p_paid_addons: [] });
    assert(order.fulfilment_method === "pickup", "D. omitted P2 args → Pickup");
    const details = await getDetails(order.id);
    assert(details.length === 0, "D. omitted P2 args → zero delivery rows");
  }

  // E. explicit Pickup
  {
    const order = await createStaffBase({
      p_fulfilment_method: "pickup",
      p_delivery: null,
      p_paid_addons: [],
    });
    assert(order.fulfilment_method === "pickup", "E. explicit Pickup");
    assert(
      (await getDetails(order.id)).length === 0,
      "E. Pickup + zero delivery rows",
    );
  }

  // O. contradictory Pickup + Delivery payload rejected
  {
    const err = await rpcExpectFail("create_staff_guest_preorder", {
      p_actor_staff_id: await getStaffId(),
      p_customer_name: "Contra",
      p_phone: null,
      p_email: null,
      p_order_source: "whatsapp",
      p_crew_order: false,
      p_pickup_date: "2026-08-25",
      p_pickup_time: "15:00:00",
      p_pickup_instruction: null,
      p_items: [
        {
          cake_id: (await getCakeSize()).cake_id,
          cake_size_id: (await getCakeSize()).id,
          quantity: 1,
        },
      ],
      p_complimentary: [],
      p_include_receipt: false,
      p_needs_bakery_attention: false,
      p_bakery_attention_note: null,
      p_customer_notes: null,
      p_internal_notes: null,
      p_paid_addons: [],
      p_fulfilment_method: "pickup",
      p_delivery: deliveryPayload(),
    });
    assert(Boolean(err), "O. contradictory Pickup + Delivery payload rejected");
  }

  // F / G / H / I / J — Delivery create
  let deliveryOrderId = null;
  {
    const order = await createStaffBase({
      p_customer_name: "Ordered By Wei",
      p_phone: "0188888888",
      p_fulfilment_method: "delivery",
      p_delivery: deliveryPayload({
        recipient_name: "Recipient Amy",
        recipient_phone: "0199999999",
        address_line_2: "   ",
        recipient_notify_preference: "inform_recipient",
      }),
      p_paid_addons: [],
    });
    deliveryOrderId = order.id;
    assert(order.fulfilment_method === "delivery", "F. Delivery create method");
    const details = await getDetails(order.id);
    assert(details.length === 1, "F. Delivery → exactly one details row");
    assert(
      order.guest_name === "Ordered By Wei" &&
        details[0].recipient_name === "Recipient Amy",
      "G. ordered-by vs recipient independent",
    );
    assert(
      order.guest_phone === "0188888888" &&
        details[0].recipient_phone === "0199999999",
      "G. phones independent",
    );
    assert(details[0].address_line_2 === null, "I. blank address_line_2 → NULL");
    assert(
      details[0].recipient_notify_preference === "inform_recipient",
      "J. Inform Recipient persists",
    );
  }

  // H. same values allowed without identity merging
  {
    const order = await createStaffBase({
      p_customer_name: "Same Person",
      p_phone: "0177777777",
      p_fulfilment_method: "delivery",
      p_delivery: deliveryPayload({
        recipient_name: "Same Person",
        recipient_phone: "0177777777",
        recipient_notify_preference: "do_not_inform_recipient",
      }),
    });
    const details = await getDetails(order.id);
    assert(
      order.guest_name === details[0].recipient_name &&
        order.guest_phone === details[0].recipient_phone,
      "H. same values allowed without merging tables",
    );
    assert(
      details[0].recipient_notify_preference === "do_not_inform_recipient",
      "K. DO NOT INFORM RECIPIENT persists",
    );
  }

  // L. invalid notify rejected
  {
    const err = await rpcExpectFail("create_staff_guest_preorder", {
      p_actor_staff_id: await getStaffId(),
      p_customer_name: "BadNotify",
      p_phone: null,
      p_email: null,
      p_order_source: "whatsapp",
      p_crew_order: false,
      p_pickup_date: "2026-08-25",
      p_pickup_time: "15:00:00",
      p_pickup_instruction: null,
      p_items: [
        {
          cake_id: (await getCakeSize()).cake_id,
          cake_size_id: (await getCakeSize()).id,
          quantity: 1,
        },
      ],
      p_complimentary: [],
      p_include_receipt: false,
      p_needs_bakery_attention: false,
      p_bakery_attention_note: null,
      p_customer_notes: null,
      p_internal_notes: null,
      p_paid_addons: [],
      p_fulfilment_method: "delivery",
      p_delivery: deliveryPayload({
        recipient_notify_preference: "maybe",
      }),
    });
    assert(Boolean(err), "L. invalid notify value rejected");
  }

  // M. blank required recipient rejected
  {
    const err = await rpcExpectFail("create_staff_guest_preorder", {
      p_actor_staff_id: await getStaffId(),
      p_customer_name: "BlankRecipient",
      p_phone: null,
      p_email: null,
      p_order_source: "whatsapp",
      p_crew_order: false,
      p_pickup_date: "2026-08-25",
      p_pickup_time: "15:00:00",
      p_pickup_instruction: null,
      p_items: [
        {
          cake_id: (await getCakeSize()).cake_id,
          cake_size_id: (await getCakeSize()).id,
          quantity: 1,
        },
      ],
      p_complimentary: [],
      p_include_receipt: false,
      p_needs_bakery_attention: false,
      p_bakery_attention_note: null,
      p_customer_notes: null,
      p_internal_notes: null,
      p_paid_addons: [],
      p_fulfilment_method: "delivery",
      p_delivery: deliveryPayload({ recipient_name: "   " }),
    });
    assert(Boolean(err), "M. blank required recipient rejected");
  }

  // N. Delivery without details rejected
  {
    const err = await rpcExpectFail("create_staff_guest_preorder", {
      p_actor_staff_id: await getStaffId(),
      p_customer_name: "NoDetails",
      p_phone: null,
      p_email: null,
      p_order_source: "whatsapp",
      p_crew_order: false,
      p_pickup_date: "2026-08-25",
      p_pickup_time: "15:00:00",
      p_pickup_instruction: null,
      p_items: [
        {
          cake_id: (await getCakeSize()).cake_id,
          cake_size_id: (await getCakeSize()).id,
          quantity: 1,
        },
      ],
      p_complimentary: [],
      p_include_receipt: false,
      p_needs_bakery_attention: false,
      p_bakery_attention_note: null,
      p_customer_notes: null,
      p_internal_notes: null,
      p_paid_addons: [],
      p_fulfilment_method: "delivery",
      p_delivery: null,
    });
    assert(Boolean(err), "N. Delivery without details rejected");
  }

  // P / Q / R / S sync RPC
  {
    const order = await createStaffBase({ p_paid_addons: [] });
    await rpc("sync_guest_order_fulfilment", {
      p_order_id: order.id,
      p_fulfilment_method: "delivery",
      p_delivery: deliveryPayload({
        recipient_name: "Sync Amy",
        address_line_2: null,
      }),
    });
    let details = await getDetails(order.id);
    assert(
      details.length === 1 && details[0].recipient_name === "Sync Amy",
      "P. Pickup → Delivery sync",
    );

    await rpc("sync_guest_order_fulfilment", {
      p_order_id: order.id,
      p_fulfilment_method: "delivery",
      p_delivery: deliveryPayload({
        recipient_name: "Sync Bob",
        recipient_notify_preference: "do_not_inform_recipient",
      }),
    });
    details = await getDetails(order.id);
    assert(
      details.length === 1 &&
        details[0].recipient_name === "Sync Bob" &&
        details[0].recipient_notify_preference === "do_not_inform_recipient",
      "Q. Delivery → Delivery edit",
    );

    const afterPickup = await rpc("sync_guest_order_fulfilment", {
      p_order_id: order.id,
      p_fulfilment_method: "pickup",
      p_delivery: null,
    });
    assert(afterPickup.fulfilment_method === "pickup", "R. Delivery → Pickup method");
    assert(
      (await getDetails(order.id)).length === 0,
      "R. Delivery → Pickup removes details",
    );

    await rpc("sync_guest_order_fulfilment", {
      p_order_id: order.id,
      p_fulfilment_method: "pickup",
      p_delivery: null,
    });
    assert(
      (await getDetails(order.id)).length === 0,
      "S. Pickup → Pickup has no details",
    );
  }

  // C. invariant — cannot leave delivery without details (direct update)
  {
    const order = await createStaffBase({
      p_fulfilment_method: "delivery",
      p_delivery: deliveryPayload(),
    });
    const { error } = await admin
      .from("orders")
      .update({ fulfilment_method: "delivery" })
      .eq("id", order.id);
    // still has details — should be fine
    assert(!error, "C. Delivery with one details row remains valid");

    // Delete details while still delivery — deferred invariant should fail at commit
    const { error: delErr } = await admin
      .from("order_delivery_details")
      .delete()
      .eq("order_id", order.id);
    assert(
      Boolean(delErr),
      "C. cannot delete details while method remains delivery",
    );
  }

  // T. cascade delete
  {
    const order = await createStaffBase({
      p_fulfilment_method: "delivery",
      p_delivery: deliveryPayload(),
    });
    const id = order.id;
    await admin.from("orders").delete().eq("id", id);
    const idx = cleanupOrderIds.indexOf(id);
    if (idx >= 0) cleanupOrderIds.splice(idx, 1);
    const details = await getDetails(id);
    assert(details.length === 0, "T. delete order cascades delivery details");
  }

  // U. anon cannot SELECT Delivery PII
  if (anon) {
    const order = await createStaffBase({
      p_fulfilment_method: "delivery",
      p_delivery: deliveryPayload(),
    });
    const { data, error } = await anon
      .from("order_delivery_details")
      .select("*")
      .eq("order_id", order.id);
    assert(
      (error && /permission|policy|RLS|denied/i.test(error.message)) ||
        (Array.isArray(data) && data.length === 0),
      "U. anon cannot SELECT Delivery PII",
    );
  } else {
    assert(false, "U. anon key missing — cannot verify");
  }

  // Security A/B: anon must NOT execute sync_guest_order_fulfilment; no mutation
  if (anon) {
    const order = await createStaffBase({
      p_fulfilment_method: "delivery",
      p_delivery: deliveryPayload({
        recipient_name: "AnonGuard Recipient",
        recipient_phone: "0191111111",
      }),
    });
    const beforeMethod = order.fulfilment_method;
    const beforeDetails = await getDetails(order.id);
    const beforeName = beforeDetails[0]?.recipient_name ?? null;

    const { data: anonSyncData, error: anonSyncErr } = await anon.rpc(
      "sync_guest_order_fulfilment",
      {
        p_order_id: order.id,
        p_fulfilment_method: "pickup",
        p_delivery: null,
      },
    );

    const after = await admin
      .from("orders")
      .select("fulfilment_method")
      .eq("id", order.id)
      .maybeSingle();
    const afterDetails = await getDetails(order.id);

    assert(
      Boolean(anonSyncErr) && !anonSyncData,
      "SEC-A. anon execute sync_guest_order_fulfilment → permission denied",
    );
    assert(
      after.data?.fulfilment_method === beforeMethod &&
        afterDetails.length === beforeDetails.length &&
        afterDetails[0]?.recipient_name === beforeName,
      "SEC-B. failed anon call causes NO mutation",
    );
  } else {
    assert(false, "SEC-A/B. anon key missing — cannot verify");
  }

  // V. internal helper not callable by anon
  if (anon) {
    const { error } = await anon.rpc("_sync_order_fulfilment_from_payload", {
      p_order_id: "00000000-0000-0000-0000-000000000000",
      p_fulfilment_method: "pickup",
      p_delivery: null,
    });
    assert(Boolean(error), "SEC-E. anon direct execute internal helper → denied");
    assert(Boolean(error), "V. internal helper cannot be called by anon");
  }

  // W + SEC-C/D: authenticated JWT can sync; cannot call internal helper
  {
    const order = await createStaffBase({
      p_fulfilment_method: "delivery",
      p_delivery: deliveryPayload({ recipient_name: "Auth Sync Target" }),
    });

    // Service-role still proves RPC body works (Owner path uses authenticated JWT in app).
    const synced = await rpc("sync_guest_order_fulfilment", {
      p_order_id: order.id,
      p_fulfilment_method: "delivery",
      p_delivery: deliveryPayload({
        recipient_name: "Auth Sync Target Edited",
        recipient_notify_preference: "do_not_inform_recipient",
      }),
    });
    assert(
      synced.id === order.id && synced.fulfilment_method === "delivery",
      "W. sync_guest_order_fulfilment callable (service-role body check)",
    );

    if (!anonKey) {
      assert(false, "SEC-C/D. anon key missing — cannot create authenticated client");
    } else {
      const email = `m4p2-slice1-sec-${Date.now()}@example.com`;
      const password = `TmpVerify_${Date.now()}_s1`;
      const { data: created, error: createUserErr } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
      if (createUserErr || !created?.user?.id) {
        assert(
          false,
          `SEC-C/D. temp auth user create failed: ${createUserErr?.message ?? "no user"}`,
        );
      } else {
        const userId = created.user.id;
        try {
          const authed = createClient(url, anonKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
          const { error: signErr } = await authed.auth.signInWithPassword({
            email,
            password,
          });
          if (signErr) {
            assert(false, `SEC-C/D. signIn failed: ${signErr.message}`);
          } else {
            const { error: authSyncErr } = await authed.rpc(
              "sync_guest_order_fulfilment",
              {
                p_order_id: order.id,
                p_fulfilment_method: "delivery",
                p_delivery: deliveryPayload({
                  recipient_name: "Auth JWT Recipient",
                  recipient_notify_preference: "inform_recipient",
                }),
              },
            );
            assert(
              !authSyncErr,
              `SEC-C. authenticated execute sync_guest_order_fulfilment → succeeds${
                authSyncErr ? `: ${authSyncErr.message}` : ""
              }`,
            );

            const { error: authInternalErr } = await authed.rpc(
              "_sync_order_fulfilment_from_payload",
              {
                p_order_id: order.id,
                p_fulfilment_method: "pickup",
                p_delivery: null,
              },
            );
            assert(
              Boolean(authInternalErr),
              "SEC-D. authenticated direct execute internal helper → denied",
            );
          }
        } finally {
          await admin.auth.admin.deleteUser(userId);
        }
      }
    }
  }

  // X. website-style Pickup creation regression
  {
    const size = await getCakeSize();
    const { data, error } = await admin.rpc("submit_guest_preorder", {
      p_customer_name: `M4P2 Web ${Date.now()}`,
      p_phone: "0123456789",
      p_email: null,
      p_pickup_date: "2026-08-26",
      p_pickup_time: "16:00:00",
      p_notes: null,
      p_items: [
        {
          cake_id: size.cake_id,
          cake_size_id: size.id,
          quantity: 1,
        },
      ],
      p_email_submission_receipt_requested: false,
    });
    if (error) {
      assert(false, `X. website submit_guest_preorder: ${error.message}`);
    } else {
      cleanupOrderIds.push(data.id);
      assert(data.fulfilment_method === "pickup", "X. website create → Pickup");
      assert(
        (await getDetails(data.id)).length === 0,
        "X. website create → no delivery details",
      );
    }
  }

  // Y / Z. paid add-ons still work with Delivery
  {
    const { data: types } = await admin
      .from("paid_addon_types")
      .select("code")
      .eq("code", "birthday_card")
      .eq("is_active", true)
      .maybeSingle();
    if (!types) {
      assert(false, "Y. birthday_card catalog missing");
    } else {
      const order = await createStaffBase({
        p_fulfilment_method: "delivery",
        p_delivery: deliveryPayload(),
        p_paid_addons: [
          {
            code: "birthday_card",
            quantity: 1,
            messages: ["hbd"],
          },
        ],
      });
      assert(order.fulfilment_method === "delivery", "Y. Delivery + paid add-ons create");
      const { data: addons } = await admin
        .from("order_paid_addons")
        .select("code, quantity, unit_price")
        .eq("order_id", order.id);
      assert(
        addons?.length === 1 &&
          addons[0].code === "birthday_card" &&
          Number(addons[0].unit_price) === 3,
        "Y. paid-add-on staff create still works with new signature",
      );
      const { data: due, error: dueErr } = await admin.rpc("order_amount_due", {
        p_order_id: order.id,
      });
      assert(!dueErr, "Z. order_amount_due callable");
      // cake library price + RM3 — at least add-on contributes 3
      assert(Number(due) >= 3, "Z. Delivery + paid add-ons coexist financially");
      assert(
        (await getDetails(order.id)).length === 1,
        "Z. Delivery details coexist with paid add-ons",
      );
    }
  }

  await cleanup();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(err);
  try {
    await cleanup();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
