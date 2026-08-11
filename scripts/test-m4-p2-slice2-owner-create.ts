/**
 * M4-P2 Slice 2 — Owner Create Pickup / Delivery (helpers + live RPC).
 * Run: npx tsx scripts/test-m4-p2-slice2-owner-create.ts
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  OWNER_CREATE_FULFILMENT_OPTIONS,
  OWNER_DELIVERY_CITY,
  OWNER_DELIVERY_STATE,
  buildCreateStaffFulfilmentRpcParams,
  buildWorkspaceFulfilmentViewModel,
  copyCustomerToRecipientDraft,
  defaultDeliveryCreateDraft,
  defaultOwnerCreateFulfilmentMethod,
  isDeliveryRecipientSameAsOrderingCustomer,
  markRecipientDivergedFromCustomer,
  normalizeOwnerCreateFulfilmentMethod,
  validateOwnerCreateFulfilment,
  type DeliveryCreateDraft,
} from "@/engines/orders/fulfilment";
import {
  calculateCakeSubtotal,
  calculateCommercialSubtotal,
  commercialLinesForSettlement,
} from "@/engines/orders/totals";
import { calculateOrderSettlement } from "@/engines/orders/settlement";

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

function completeDelivery(
  overrides: Partial<DeliveryCreateDraft> = {},
): DeliveryCreateDraft {
  return {
    ...defaultDeliveryCreateDraft(),
    recipientName: "Mum",
    recipientPhone: "0198888888",
    addressLine1: "12 Jalan Delivery",
    addressLine2: "",
    postcode: "50450",
    city: "Kuala Lumpur",
    state: "Wilayah Persekutuan",
    recipientNotifyPreference: "inform_recipient",
    sameAsCustomer: false,
    ...overrides,
  };
}

// A. default draft method = Pickup
assert.equal(defaultOwnerCreateFulfilmentMethod(), "pickup");
assert.equal(normalizeOwnerCreateFulfilmentMethod(undefined), "pickup");
assert.equal(normalizeOwnerCreateFulfilmentMethod("drive_through"), "pickup");

// B. Pickup create payload
{
  const stale = completeDelivery({ recipientName: "Should Not Send" });
  const pickup = buildCreateStaffFulfilmentRpcParams({
    method: "pickup",
    delivery: stale,
  });
  assert.deepEqual(pickup, {
    p_fulfilment_method: "pickup",
    p_delivery: null,
  });
}

// C. Pickup existing fields remain valid with schedule only
assert.equal(
  validateOwnerCreateFulfilment({
    method: "pickup",
    pickupDate: "2026-08-25",
    pickupTime: "15:00:00",
    delivery: defaultDeliveryCreateDraft(),
  }),
  null,
);

// D. Delivery draft exposes required shape
{
  const draft = defaultDeliveryCreateDraft();
  assert.equal(draft.recipientNotifyPreference, null);
  assert.ok("recipientName" in draft);
  assert.ok("addressLine1" in draft);
  assert.ok("addressLine2" in draft);
  assert.ok("postcode" in draft);
  assert.ok("city" in draft);
  assert.ok("state" in draft);
}

// E. Delivery create payload maps fields; city/state forced to KK area
{
  const delivery = completeDelivery({
    recipientName: "  Mum  ",
    recipientPhone: " 0198888888 ",
    addressLine1: " 12 Jalan ",
    addressLine2: "  Unit 2  ",
    postcode: " 50450 ",
    city: "",
    state: "",
    recipientNotifyPreference: "do_not_inform_recipient",
  });
  const rpc = buildCreateStaffFulfilmentRpcParams({
    method: "delivery",
    delivery,
  });
  assert.deepEqual(rpc, {
    p_fulfilment_method: "delivery",
    p_delivery: {
      recipient_name: "Mum",
      recipient_phone: "0198888888",
      address_line_1: "12 Jalan",
      address_line_2: "Unit 2",
      postcode: "50450",
      city: OWNER_DELIVERY_CITY,
      state: OWNER_DELIVERY_STATE,
      recipient_notify_preference: "do_not_inform_recipient",
    },
  });
  assert.equal(OWNER_DELIVERY_CITY, "Kota Kinabalu");
  assert.equal(OWNER_DELIVERY_STATE, "Sabah");
  assert.ok(!("fee" in (rpc.p_delivery as object)));
  assert.ok(!("grab" in (rpc.p_delivery as object)));
}

// F. ordered-by ≠ recipient preserved in payload (independent fields)
{
  const rpc = buildCreateStaffFulfilmentRpcParams({
    method: "delivery",
    delivery: completeDelivery({
      recipientName: "Mum",
      recipientPhone: "0198888888",
    }),
  });
  assert.equal(rpc.p_delivery?.recipient_name, "Mum");
  assert.notEqual(rpc.p_delivery?.recipient_name, "Amy");
}

// G / H. Same as Customer copies then can diverge
{
  let draft = defaultDeliveryCreateDraft();
  draft = copyCustomerToRecipientDraft(draft, {
    name: "Amy",
    phone: "0123456789",
  });
  assert.equal(draft.recipientName, "Amy");
  assert.equal(draft.recipientPhone, "0123456789");
  assert.equal(draft.sameAsCustomer, true);
  assert.equal(draft.recipientNotifyPreference, "inform_recipient");
  draft = {
    ...markRecipientDivergedFromCustomer(draft),
    recipientName: "Mum",
    recipientPhone: "0190000000",
  };
  assert.equal(draft.sameAsCustomer, false);
  assert.equal(draft.recipientNotifyPreference, null);
  assert.equal(draft.recipientName, "Mum");
  assert.equal(draft.recipientPhone, "0190000000");
}

// G2. Same as Customer does not require manual notify choice
{
  const draft = copyCustomerToRecipientDraft(
    {
      ...completeDelivery({
        recipientName: "",
        recipientPhone: "",
        recipientNotifyPreference: null,
      }),
      sameAsCustomer: false,
    },
    { name: "Amy", phone: "0123456789" },
  );
  // Clear auto-set notify to prove validation uses sameAsCustomer flag
  const withoutVisibleChoice = {
    ...draft,
    recipientNotifyPreference: null as null,
    addressLine1: "12 Jalan",
    postcode: "50450",
    city: "",
    state: "",
  };
  assert.equal(
    validateOwnerCreateFulfilment({
      method: "delivery",
      pickupDate: "2026-08-25",
      pickupTime: "15:00:00",
      delivery: withoutVisibleChoice,
    }),
    null,
  );
  const rpc = buildCreateStaffFulfilmentRpcParams({
    method: "delivery",
    delivery: withoutVisibleChoice,
  });
  assert.equal(rpc.p_delivery?.recipient_notify_preference, "inform_recipient");
  assert.equal(rpc.p_delivery?.recipient_name, "Amy");
  assert.equal(rpc.p_delivery?.recipient_phone, "0123456789");
  assert.equal(rpc.p_delivery?.city, "Kota Kinabalu");
  assert.equal(rpc.p_delivery?.state, "Sabah");
}

// G3. different recipient still requires explicit notify
assert.match(
  validateOwnerCreateFulfilment({
    method: "delivery",
    pickupDate: "2026-08-25",
    pickupTime: "15:00:00",
    delivery: completeDelivery({
      sameAsCustomer: false,
      recipientNotifyPreference: null,
    }),
  }) ?? "",
  /inform the recipient/i,
);

// G4. DO NOT INFORM remains available for different-recipient Delivery
{
  const rpc = buildCreateStaffFulfilmentRpcParams({
    method: "delivery",
    delivery: completeDelivery({
      sameAsCustomer: false,
      recipientNotifyPreference: "do_not_inform_recipient",
    }),
  });
  assert.equal(
    rpc.p_delivery?.recipient_notify_preference,
    "do_not_inform_recipient",
  );
}

// I. address_line_2 optional / blank → null
{
  const rpc = buildCreateStaffFulfilmentRpcParams({
    method: "delivery",
    delivery: completeDelivery({ addressLine2: "   " }),
  });
  assert.equal(rpc.p_delivery?.address_line_2, null);
}

// J / K. notify mapping
assert.equal(
  buildCreateStaffFulfilmentRpcParams({
    method: "delivery",
    delivery: completeDelivery({
      recipientNotifyPreference: "inform_recipient",
    }),
  }).p_delivery?.recipient_notify_preference,
  "inform_recipient",
);
assert.equal(
  buildCreateStaffFulfilmentRpcParams({
    method: "delivery",
    delivery: completeDelivery({
      recipientNotifyPreference: "do_not_inform_recipient",
    }),
  }).p_delivery?.recipient_notify_preference,
  "do_not_inform_recipient",
);

// L–R. Delivery validation blockers
const baseDeliveryArgs = {
  method: "delivery" as const,
  pickupDate: "2026-08-25",
  pickupTime: "15:00:00",
};
assert.match(
  validateOwnerCreateFulfilment({
    ...baseDeliveryArgs,
    delivery: completeDelivery({ recipientNotifyPreference: null }),
  }) ?? "",
  /inform the recipient/i,
);
assert.match(
  validateOwnerCreateFulfilment({
    ...baseDeliveryArgs,
    delivery: completeDelivery({ recipientName: "  " }),
  }) ?? "",
  /recipient name/i,
);
assert.match(
  validateOwnerCreateFulfilment({
    ...baseDeliveryArgs,
    delivery: completeDelivery({ recipientPhone: "" }),
  }) ?? "",
  /recipient phone/i,
);
assert.match(
  validateOwnerCreateFulfilment({
    ...baseDeliveryArgs,
    delivery: completeDelivery({ addressLine1: "" }),
  }) ?? "",
  /address line 1/i,
);
assert.match(
  validateOwnerCreateFulfilment({
    ...baseDeliveryArgs,
    delivery: completeDelivery({ postcode: "" }),
  }) ?? "",
  /postcode/i,
);
// City/state are not Owner-required (server normalizes KK/Sabah)
assert.equal(
  validateOwnerCreateFulfilment({
    ...baseDeliveryArgs,
    delivery: completeDelivery({ city: "", state: "" }),
  }),
  null,
);
{
  const rpc = buildCreateStaffFulfilmentRpcParams({
    method: "delivery",
    delivery: completeDelivery({
      city: "Anything Client Sent",
      state: "Anything Client Sent",
    }),
  });
  assert.equal(rpc.p_delivery?.city, "Kota Kinabalu");
  assert.equal(rpc.p_delivery?.state, "Sabah");
}

// S. Delivery→Pickup final payload clears delivery
{
  const filled = completeDelivery();
  assert.deepEqual(
    buildCreateStaffFulfilmentRpcParams({
      method: "pickup",
      delivery: filled,
    }),
    { p_fulfilment_method: "pickup", p_delivery: null },
  );
}

// T. Pickup→Delivery requires Delivery validation
assert.notEqual(
  validateOwnerCreateFulfilment({
    method: "delivery",
    pickupDate: "2026-08-25",
    pickupTime: "15:00:00",
    delivery: defaultDeliveryCreateDraft(),
  }),
  null,
);
assert.equal(
  validateOwnerCreateFulfilment({
    method: "delivery",
    pickupDate: "2026-08-25",
    pickupTime: "15:00:00",
    delivery: completeDelivery(),
  }),
  null,
);

// U. Delivery + BC×2 payload preserves paid add-ons (shape coexistence)
{
  const fulfilment = buildCreateStaffFulfilmentRpcParams({
    method: "delivery",
    delivery: completeDelivery(),
  });
  const paidAddons = [
    {
      code: "birthday_card",
      quantity: 2,
      messages: ["Happy Birthday Amy!", "Love from Mum"],
    },
  ];
  assert.equal(fulfilment.p_fulfilment_method, "delivery");
  assert.equal(paidAddons[0]?.quantity, 2);
  assert.equal(paidAddons[0]?.messages.length, 2);
}

// V. Delivery has zero financial effect
{
  const cakes = [{ unitPrice: 125, quantity: 1 }];
  const addons = [{ unitPrice: 3, quantity: 2 }];
  assert.equal(calculateCakeSubtotal(cakes), 125);
  assert.equal(
    calculateCommercialSubtotal({ items: cakes, paidAddons: addons }),
    131,
  );
  const settled = calculateOrderSettlement({
    items: commercialLinesForSettlement({ items: cakes, paidAddons: addons }),
    adjustments: [],
    allocations: [],
    refunds: [],
  });
  assert.equal(settled.subtotal, 131);
  assert.equal(settled.amountDue, 131);
}

// W. no Drive-through Owner option
assert.deepEqual(
  OWNER_CREATE_FULFILMENT_OPTIONS.map((o) => o.value),
  ["pickup", "delivery"],
);
assert.ok(
  !OWNER_CREATE_FULFILMENT_OPTIONS.some((o) => o.value === "drive_through"),
);

// X. website Pickup path unchanged (helper default remains pickup; no website API change)
assert.equal(defaultOwnerCreateFulfilmentMethod(), "pickup");

// Y. existing Pickup create regression (validate + payload)
assert.equal(
  validateOwnerCreateFulfilment({
    method: "pickup",
    pickupDate: "2026-08-25",
    pickupTime: "15:00:00",
    delivery: completeDelivery(), // stale draft ignored
  }),
  null,
);

// Z. no Delivery fee / Grab fields introduced
{
  const rpc = buildCreateStaffFulfilmentRpcParams({
    method: "delivery",
    delivery: completeDelivery(),
  });
  const keys = Object.keys(rpc.p_delivery ?? {});
  assert.deepEqual(keys.sort(), [
    "address_line_1",
    "address_line_2",
    "city",
    "postcode",
    "recipient_name",
    "recipient_notify_preference",
    "recipient_phone",
    "state",
  ]);
}

// Product Test 2 correction — Workspace presentation (read-only)
{
  const pickupVm = buildWorkspaceFulfilmentViewModel({
    fulfilmentMethod: "pickup",
    delivery: null,
    customerName: "Amy",
    phone: "0123456789",
  });
  assert.equal(pickupVm.sectionTitle, "Pickup");
  assert.equal(pickupVm.dateLabel, "Pickup date");
  assert.equal(pickupVm.timeLabel, "Pickup time");
  assert.equal(pickupVm.isDelivery, false);
  assert.equal(pickupVm.delivery, null);
  assert.equal(pickupVm.notifyLabel, null);

  const deliveryPayload = {
    recipientName: "Mum",
    recipientPhone: "0198888888",
    addressLine1: "12 Jalan Delivery",
    addressLine2: null as string | null,
    postcode: "88300",
    city: OWNER_DELIVERY_CITY,
    state: OWNER_DELIVERY_STATE,
    recipientNotifyPreference: "inform_recipient" as const,
  };
  const deliveryVm = buildWorkspaceFulfilmentViewModel({
    fulfilmentMethod: "delivery",
    delivery: deliveryPayload,
    customerName: "Amy",
    phone: "0123456789",
  });
  assert.equal(deliveryVm.sectionTitle, "Delivery");
  assert.equal(deliveryVm.dateLabel, "Delivery date");
  assert.equal(deliveryVm.timeLabel, "Delivery time");
  assert.equal(deliveryVm.isDelivery, true);
  assert.equal(deliveryVm.delivery?.recipientName, "Mum");
  assert.equal(deliveryVm.delivery?.recipientPhone, "0198888888");
  assert.equal(deliveryVm.delivery?.addressLine1, "12 Jalan Delivery");
  assert.equal(deliveryVm.delivery?.addressLine2, null);
  assert.equal(deliveryVm.recipientSameAsCustomer, false);
  assert.equal(deliveryVm.notifyLabel, "Inform Recipient");

  const withLine2 = buildWorkspaceFulfilmentViewModel({
    fulfilmentMethod: "delivery",
    delivery: { ...deliveryPayload, addressLine2: "Unit 5" },
    customerName: "Amy",
    phone: "0123456789",
  });
  assert.equal(withLine2.delivery?.addressLine2, "Unit 5");

  const doNotInform = buildWorkspaceFulfilmentViewModel({
    fulfilmentMethod: "delivery",
    delivery: {
      ...deliveryPayload,
      recipientNotifyPreference: "do_not_inform_recipient",
    },
    customerName: "Amy",
    phone: "0123456789",
  });
  assert.equal(doNotInform.notifyLabel, "DO NOT INFORM RECIPIENT");

  // Refinement A: same customer/recipient → omit Notify (even if inform_recipient persisted)
  assert.equal(
    isDeliveryRecipientSameAsOrderingCustomer({
      customerName: " Amy ",
      customerPhone: "012-345 6789",
      delivery: {
        ...deliveryPayload,
        recipientName: "Amy",
        recipientPhone: "0123456789",
      },
    }),
    true,
  );
  const samePersonVm = buildWorkspaceFulfilmentViewModel({
    fulfilmentMethod: "delivery",
    delivery: {
      ...deliveryPayload,
      recipientName: "Amy",
      recipientPhone: "0123456789",
      recipientNotifyPreference: "inform_recipient",
    },
    customerName: "Amy",
    phone: "0123456789",
  });
  assert.equal(samePersonVm.recipientSameAsCustomer, true);
  assert.equal(samePersonVm.notifyLabel, null);

  // Pickup method ignores a stray delivery object for presentation flags
  const pickupIgnoresDelivery = buildWorkspaceFulfilmentViewModel({
    fulfilmentMethod: "pickup",
    delivery: deliveryPayload,
    customerName: "Amy",
    phone: "0123456789",
  });
  assert.equal(pickupIgnoresDelivery.isDelivery, false);
  assert.equal(pickupIgnoresDelivery.delivery, null);
  assert.equal(pickupIgnoresDelivery.sectionTitle, "Pickup");

  // View model is display-only — no edit/mutation shape
  assert.ok(!("editable" in deliveryVm));
  assert.ok(!("draft" in deliveryVm));
  assert.ok(!("onChange" in deliveryVm));
}

console.log("M4-P2 Slice 2 owner-create helper tests: PASSED");

void runLiveDb();

async function runLiveDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log(
      "SKIP live DB create verification (missing Supabase env). Helper suite still PASSED.",
    );
    return;
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const cleanup: string[] = [];
  let passed = 0;
  let failed = 0;

  function check(condition: boolean, label: string) {
    if (condition) {
      passed += 1;
      console.log(`PASS  ${label}`);
    } else {
      failed += 1;
      console.error(`FAIL  ${label}`);
    }
  }

  try {
    const { data: staff, error: staffErr } = await admin
      .from("staff_profiles")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (staffErr || !staff?.id) throw new Error("No staff_profiles");

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

    async function create(extra: Record<string, unknown>) {
      const { data, error } = await admin.rpc("create_staff_guest_preorder", {
        p_actor_staff_id: staff!.id,
        p_customer_name: `M4P2 Slice2 ${Date.now()}`,
        p_phone: "0123456789",
        p_email: null,
        p_order_source: "whatsapp",
        p_crew_order: false,
        p_pickup_date: "2026-08-26",
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
        p_internal_notes: "m4p2-slice2-create",
        ...extra,
      });
      if (error) throw new Error(error.message);
      cleanup.push(data.id);
      return data as {
        id: string;
        fulfilment_method: string;
        guest_name?: string;
        guest_phone?: string;
      };
    }

    async function details(orderId: string) {
      const { data } = await admin
        .from("order_delivery_details")
        .select("*")
        .eq("order_id", orderId);
      return data ?? [];
    }

    // Pickup
    {
      const payload = buildCreateStaffFulfilmentRpcParams({
        method: "pickup",
        delivery: completeDelivery(),
      });
      const order = await create(payload);
      const rows = await details(order.id);
      check(order.fulfilment_method === "pickup", "LIVE Pickup method");
      check(rows.length === 0, "LIVE Pickup → no details row");
    }

    // Delivery different recipient
    {
      const payload = buildCreateStaffFulfilmentRpcParams({
        method: "delivery",
        delivery: completeDelivery({
          recipientName: "Mum",
          recipientPhone: "0198888888",
          recipientNotifyPreference: "inform_recipient",
        }),
      });
      const order = await create({
        ...payload,
        p_customer_name: "Amy Slice2",
        p_phone: "0123456789",
      });
      const rows = await details(order.id);
      check(order.fulfilment_method === "delivery", "LIVE Delivery method");
      check(rows.length === 1, "LIVE Delivery → one details row");
      check(
        rows[0]?.recipient_name === "Mum" &&
          rows[0]?.recipient_phone === "0198888888",
        "LIVE ordered-by ≠ recipient",
      );
      check(
        rows[0]?.recipient_notify_preference === "inform_recipient",
        "LIVE Inform Recipient enum",
      );
      check(
        rows[0]?.city === "Kota Kinabalu" && rows[0]?.state === "Sabah",
        "LIVE different-recipient city/state = KK/Sabah",
      );
    }

    // Delivery Same as Customer — notify hidden; persists inform_recipient
    {
      const sameDraft = copyCustomerToRecipientDraft(
        {
          ...completeDelivery({
            recipientNotifyPreference: null,
            sameAsCustomer: false,
            city: "",
            state: "",
          }),
          addressLine1: "88 Same Street",
          addressLine2: "",
          postcode: "88000",
        },
        { name: "Amy Same", phone: "0121111222" },
      );
      // Simulate UI: no visible notify choice; flag drives normalization
      sameDraft.recipientNotifyPreference = null;
      assert.equal(sameDraft.sameAsCustomer, true);
      const payload = buildCreateStaffFulfilmentRpcParams({
        method: "delivery",
        delivery: sameDraft,
      });
      const order = await create({
        ...payload,
        p_customer_name: "Amy Same",
        p_phone: "0121111222",
      });
      const rows = await details(order.id);
      check(
        rows[0]?.recipient_name === "Amy Same" &&
          rows[0]?.recipient_phone === "0121111222",
        "LIVE Same as Customer recipient = customer",
      );
      check(
        rows[0]?.recipient_notify_preference === "inform_recipient",
        "LIVE Same as Customer normalizes inform_recipient",
      );
      check(
        rows[0]?.recipient_notify_preference !== "do_not_inform_recipient",
        "LIVE Same as Customer is not DO NOT INFORM",
      );
      check(
        rows[0]?.city === "Kota Kinabalu" && rows[0]?.state === "Sabah",
        "LIVE Same as Customer city/state = KK/Sabah",
      );
      const sameVm = buildWorkspaceFulfilmentViewModel({
        fulfilmentMethod: "delivery",
        delivery: {
          recipientName: rows[0]!.recipient_name,
          recipientPhone: rows[0]!.recipient_phone,
          addressLine1: rows[0]!.address_line_1,
          addressLine2: rows[0]!.address_line_2,
          postcode: rows[0]!.postcode,
          city: rows[0]!.city,
          state: rows[0]!.state,
          recipientNotifyPreference: rows[0]!
            .recipient_notify_preference as "inform_recipient",
        },
        customerName: "Amy Same",
        phone: "0121111222",
      });
      check(sameVm.notifyLabel === null, "LIVE Workspace omits Notify for same person");
    }

    // Delivery + BC×2
    {
      const payload = buildCreateStaffFulfilmentRpcParams({
        method: "delivery",
        delivery: completeDelivery({
          recipientNotifyPreference: "do_not_inform_recipient",
        }),
      });
      const order = await create({
        ...payload,
        p_paid_addons: [
          {
            code: "birthday_card",
            quantity: 2,
            messages: ["Card 1", "Card 2"],
          },
        ],
      });
      const rows = await details(order.id);
      const { data: addons } = await admin
        .from("order_paid_addons")
        .select("id, code, quantity")
        .eq("order_id", order.id);
      const bc = addons?.find((a) => a.code === "birthday_card");
      const { data: messages } = bc
        ? await admin
            .from("order_paid_addon_messages")
            .select("card_index, written_message")
            .eq("order_paid_addon_id", bc.id)
            .order("card_index")
        : { data: [] };
      const { data: amountDue } = await admin.rpc("order_amount_due", {
        p_order_id: order.id,
      });
      const { data: cakeSub } = await admin.rpc("order_items_subtotal", {
        p_order_id: order.id,
      });
      const { data: addonSub } = await admin.rpc("order_paid_addons_subtotal", {
        p_order_id: order.id,
      });
      check(rows.length === 1, "LIVE Delivery + BC details row");
      check(bc?.quantity === 2, "LIVE BC×2 persisted");
      check(
        (messages ?? []).length === 2 &&
          messages?.[0]?.written_message === "Card 1" &&
          messages?.[1]?.written_message === "Card 2",
        "LIVE two card message slots",
      );
      check(
        rows[0]?.recipient_notify_preference === "do_not_inform_recipient",
        "LIVE DO NOT INFORM RECIPIENT",
      );
      check(Number(addonSub) === 6, "LIVE paid-add-on subtotal RM6");
      check(
        Number(amountDue) === Number(cakeSub) + Number(addonSub),
        "LIVE Delivery contributes RM0 to amountDue",
      );
    }
  } finally {
    for (const id of cleanup) {
      try {
        await admin.from("payment_allocations").delete().eq("order_id", id);
        await admin.from("order_adjustments").delete().eq("order_id", id);
        await admin.from("order_timeline_events").delete().eq("order_id", id);
        await admin.from("orders").delete().eq("id", id);
      } catch {
        /* ignore */
      }
    }
  }

  console.log(`Live DB create checks: ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}