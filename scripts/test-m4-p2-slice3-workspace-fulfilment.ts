/**
 * M4-P2 Slice 3 — Workspace fulfilment editing + confirmation materiality.
 * Run: npx tsx scripts/test-m4-p2-slice3-workspace-fulfilment.ts
 *
 * Covers A–AI (helpers + live sync path mirroring saveOrderWorkspaceAction).
 * Does NOT assert Delivery Confirmation body (Slice 4).
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  orderMateriallyAffectsConfirmation,
  shouldOutdateSentConfirmation,
} from "@/engines/orders/confirmation-validity";
import {
  OWNER_CREATE_FULFILMENT_OPTIONS,
  OWNER_DELIVERY_CITY,
  OWNER_DELIVERY_STATE,
  buildCreateStaffFulfilmentRpcParams,
  copyCustomerToRecipientDraft,
  defaultDeliveryCreateDraft,
  defaultDeliveryFinanceDtoFields,
  deliveryDraftFromPersistedOrder,
  fulfilmentMateriallyDiffer,
  fulfilmentTimelineSummary,
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
import type {
  StorefrontOrder,
  StorefrontOrderDelivery,
} from "@/types/storefront";

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
    postcode: "88400",
    city: "Kuala Lumpur",
    state: "Wilayah",
    recipientNotifyPreference: "inform_recipient",
    sameAsCustomer: false,
    ...overrides,
  };
}

function deliveryFromDraft(draft: DeliveryCreateDraft): StorefrontOrderDelivery {
  const rpc = buildCreateStaffFulfilmentRpcParams({
    method: "delivery",
    delivery: draft,
  });
  const d = rpc.p_delivery!;
  return {
    recipientName: d.recipient_name,
    recipientPhone: d.recipient_phone,
    addressLine1: d.address_line_1,
    addressLine2: d.address_line_2,
    postcode: d.postcode,
    city: d.city,
    state: d.state,
    recipientNotifyPreference: d.recipient_notify_preference,
    ...defaultDeliveryFinanceDtoFields(),
  };
}

const cakeItem = {
  cakeId: "c1",
  cakeSizeId: "s1",
  quantity: 1,
  unitPrice: 125,
  cakeName: "Cake",
  sizeLabel: '6"',
};

function baseOrder(
  overrides: Partial<StorefrontOrder> = {},
): StorefrontOrder {
  return {
    id: "o1",
    orderNumber: "WOS-1",
    status: "awaiting_payment",
    customerName: "Amy",
    phone: "0123456789",
    email: null,
    pickupDate: "2026-08-20",
    pickupTime: "14:00:00",
    pickupInstruction: null,
    customerNotes: null,
    internalNotes: null,
    orderSource: "whatsapp",
    crewOrder: false,
    includeReceipt: false,
    needsBakeryAttention: false,
    bakeryAttentionNote: null,
    confirmationNeedsResend: false,
    fulfilmentMethod: "pickup",
    delivery: null,
    items: [cakeItem],
    complimentaryItems: [],
    paidAddons: [],
    settlement: {
      amountDue: 125,
      netReceived: 0,
      remainingBalance: 125,
      overpayment: 0,
    },
    ...overrides,
  } as StorefrontOrder;
}

function afterShape(
  order: StorefrontOrder,
  patch: {
    customerName?: string;
    phone?: string;
    pickupDate?: string;
    pickupTime?: string;
    fulfilmentMethod?: "pickup" | "delivery";
    delivery?: StorefrontOrderDelivery | null;
    items?: typeof cakeItem[];
    complimentaryItems?: Array<{ name: string; quantity: number }>;
    paidAddons?: StorefrontOrder["paidAddons"];
  },
) {
  return {
    customerName: patch.customerName ?? order.customerName,
    phone: patch.phone ?? order.phone,
    pickupDate: patch.pickupDate ?? order.pickupDate,
    pickupTime: patch.pickupTime ?? order.pickupTime,
    items: patch.items ?? order.items,
    complimentaryItems: patch.complimentaryItems ?? order.complimentaryItems,
    paidAddons: patch.paidAddons ?? order.paidAddons,
    fulfilmentMethod: patch.fulfilmentMethod ?? order.fulfilmentMethod,
    delivery: patch.delivery !== undefined ? patch.delivery : order.delivery,
  };
}

// ---------------------------------------------------------------------------
// Helper / materiality suite (A–AI where unit-testable)
// ---------------------------------------------------------------------------

// AI. Drive-through still unavailable in Owner Workspace options
assert.deepEqual(
  OWNER_CREATE_FULFILMENT_OPTIONS.map((o) => o.value),
  ["pickup", "delivery"],
);
assert.equal(normalizeOwnerCreateFulfilmentMethod("drive_through"), "pickup");

// A. Pickup unchanged → not material
{
  const before = baseOrder();
  assert.equal(
    orderMateriallyAffectsConfirmation(before, afterShape(before, {})),
    false,
  );
}

// B. Pickup schedule edit → material
{
  const before = baseOrder();
  assert.equal(
    orderMateriallyAffectsConfirmation(
      before,
      afterShape(before, { pickupTime: "15:30:00" }),
    ),
    true,
  );
}

// C. Pickup → Delivery different recipient → material
{
  const before = baseOrder();
  const delivery = deliveryFromDraft(completeDelivery());
  assert.equal(
    orderMateriallyAffectsConfirmation(
      before,
      afterShape(before, { fulfilmentMethod: "delivery", delivery }),
    ),
    true,
  );
}

// D. Pickup → Delivery Same as Customer → material (method change)
{
  const before = baseOrder();
  const draft = copyCustomerToRecipientDraft(completeDelivery(), {
    name: before.customerName,
    phone: before.phone,
  });
  draft.addressLine1 = "88 Jalan Same";
  draft.postcode = "88400";
  const delivery = deliveryFromDraft(draft);
  assert.equal(delivery.recipientName, "Amy");
  assert.equal(delivery.recipientNotifyPreference, "inform_recipient");
  assert.equal(
    orderMateriallyAffectsConfirmation(
      before,
      afterShape(before, { fulfilmentMethod: "delivery", delivery }),
    ),
    true,
  );
}

// E. incomplete Delivery rejected by validation (Save blocked)
assert.match(
  validateOwnerCreateFulfilment({
    method: "delivery",
    pickupDate: "2026-08-20",
    pickupTime: "14:00:00",
    delivery: completeDelivery({ addressLine1: "" }),
  }) ?? "",
  /address line 1/i,
);

// F–I. Delivery→Delivery field edits are material
{
  const delivery = deliveryFromDraft(completeDelivery());
  const before = baseOrder({
    fulfilmentMethod: "delivery",
    delivery,
  });
  assert.equal(
    orderMateriallyAffectsConfirmation(
      before,
      afterShape(before, {
        delivery: {
          ...delivery,
          recipientName: "Dad",
        },
      }),
    ),
    true,
  );
  assert.equal(
    orderMateriallyAffectsConfirmation(
      before,
      afterShape(before, {
        delivery: { ...delivery, addressLine1: "99 New Road" },
      }),
    ),
    true,
  );
  assert.equal(
    orderMateriallyAffectsConfirmation(
      before,
      afterShape(before, {
        delivery: {
          ...delivery,
          recipientNotifyPreference: "do_not_inform_recipient",
        },
      }),
    ),
    true,
  );
  assert.equal(
    orderMateriallyAffectsConfirmation(
      before,
      afterShape(before, { pickupDate: "2026-08-22" }),
    ),
    true,
  );
}

// J. Delivery → Pickup material
{
  const before = baseOrder({
    fulfilmentMethod: "delivery",
    delivery: deliveryFromDraft(completeDelivery()),
  });
  assert.equal(
    orderMateriallyAffectsConfirmation(
      before,
      afterShape(before, { fulfilmentMethod: "pickup", delivery: null }),
    ),
    true,
  );
}

// M. Same-as-Customer initial detection from persisted order
{
  const delivery = deliveryFromDraft(
    copyCustomerToRecipientDraft(completeDelivery(), {
      name: "Amy Tan",
      phone: "012-345 6789",
    }),
  );
  // Force matching identity with whitespace/case differences in persisted form
  const persisted: StorefrontOrderDelivery = {
    ...delivery,
    recipientName: "Amy Tan",
    recipientPhone: "0123456789",
  };
  assert.equal(
    isDeliveryRecipientSameAsOrderingCustomer({
      customerName: "  amy   tan ",
      customerPhone: "(012) 345-6789",
      delivery: persisted,
    }),
    true,
  );
  const draft = deliveryDraftFromPersistedOrder({
    customerName: "Amy Tan",
    customerPhone: "0123456789",
    fulfilmentMethod: "delivery",
    delivery: persisted,
  });
  assert.equal(draft.sameAsCustomer, true);
  assert.equal(draft.recipientNotifyPreference, "inform_recipient");
}

// N. Editing same recipient into different requires explicit notify
{
  let draft = deliveryDraftFromPersistedOrder({
    customerName: "Amy",
    customerPhone: "0123456789",
    fulfilmentMethod: "delivery",
    delivery: deliveryFromDraft(
      copyCustomerToRecipientDraft(completeDelivery(), {
        name: "Amy",
        phone: "0123456789",
      }),
    ),
  });
  assert.equal(draft.sameAsCustomer, true);
  draft = {
    ...markRecipientDivergedFromCustomer(draft),
    recipientName: "Mum",
    recipientPhone: "0190000000",
  };
  assert.equal(draft.sameAsCustomer, false);
  assert.equal(draft.recipientNotifyPreference, null);
  assert.match(
    validateOwnerCreateFulfilment({
      method: "delivery",
      pickupDate: "2026-08-20",
      pickupTime: "14:00:00",
      delivery: draft,
    }) ?? "",
    /inform the recipient/i,
  );
}

// O. KK/Sabah server normalization
{
  const rpc = buildCreateStaffFulfilmentRpcParams({
    method: "delivery",
    delivery: completeDelivery({ city: "Penang", state: "Penang" }),
  });
  assert.equal(rpc.p_delivery?.city, OWNER_DELIVERY_CITY);
  assert.equal(rpc.p_delivery?.state, OWNER_DELIVERY_STATE);
}

// AC. unchanged fulfilment save does NOT invalidate
{
  const delivery = deliveryFromDraft(completeDelivery());
  const before = baseOrder({
    status: "paid",
    fulfilmentMethod: "delivery",
    delivery,
  });
  assert.equal(
    orderMateriallyAffectsConfirmation(before, afterShape(before, {})),
    false,
  );
  assert.equal(
    shouldOutdateSentConfirmation({
      materialChange: false,
      orderStatus: "paid",
    }),
    false,
  );
}

// AD. normalization-equivalent save does NOT invalidate
{
  const delivery = deliveryFromDraft(
    completeDelivery({
      recipientName: "Mum",
      addressLine2: null as unknown as string,
      city: "Anything",
      state: "Anything",
    }),
  );
  const before = baseOrder({
    fulfilmentMethod: "delivery",
    delivery,
  });
  // Re-build with whitespace / different client city — same stored truth
  const afterDelivery = deliveryFromDraft(
    completeDelivery({
      recipientName: "  Mum  ",
      addressLine2: "   ",
      city: "Ignored",
      state: "Ignored",
    }),
  );
  assert.equal(
    fulfilmentMateriallyDiffer(
      {
        method: "delivery",
        pickupDate: before.pickupDate,
        pickupTime: before.pickupTime,
        delivery,
      },
      {
        method: "delivery",
        pickupDate: before.pickupDate,
        pickupTime: before.pickupTime,
        delivery: afterDelivery,
      },
    ),
    false,
  );
  assert.equal(
    orderMateriallyAffectsConfirmation(
      before,
      afterShape(before, { delivery: afterDelivery }),
    ),
    false,
  );
}

// X–AB / AE–AF. sent confirmation invalidation + status preserved
{
  for (const status of ["awaiting_payment", "paid"] as const) {
    const before = baseOrder({
      status,
      fulfilmentMethod: "pickup",
      delivery: null,
    });
    const delivery = deliveryFromDraft(completeDelivery());
    const material = orderMateriallyAffectsConfirmation(
      before,
      afterShape(before, { fulfilmentMethod: "delivery", delivery }),
    );
    assert.equal(material, true);
    assert.equal(
      shouldOutdateSentConfirmation({
        materialChange: material,
        orderStatus: status,
      }),
      true,
    );
  }
}

// AG. timeline summary before/after shape
{
  const summary = fulfilmentTimelineSummary({
    method: "delivery",
    pickupDate: "2026-08-20",
    pickupTime: "14:00",
    delivery: deliveryFromDraft(completeDelivery()),
  });
  assert.equal(summary.method, "delivery");
  assert.equal(summary.date, "2026-08-20");
  assert.equal(summary.time, "14:00");
  assert.ok(summary.delivery);
  assert.equal(summary.delivery.city, OWNER_DELIVERY_CITY);
  assert.equal(summary.delivery.state, OWNER_DELIVERY_STATE);
}

// P–W financial / identity non-regression at helper level
{
  const items = [cakeItem];
  const cakeSubtotal = calculateCakeSubtotal(items);
  const paidAddons = [
    {
      code: "birthday_card",
      quantity: 1,
      unitPrice: 3,
      name: "Birthday Card",
      financialShorthand: "BC",
    },
  ];
  const commercialSubtotal = calculateCommercialSubtotal({
    items,
    paidAddons,
  });
  const settlement = calculateOrderSettlement({
    items: commercialLinesForSettlement({ items, paidAddons }),
    adjustments: [],
    allocations: [],
    refunds: [],
  });
  // Fulfilment method is not an input to settlement
  assert.equal(cakeSubtotal, 125);
  assert.equal(commercialSubtotal, 128);
  assert.equal(settlement.amountDue, 128);
}

// Delivery→Pickup payload clears delivery (K helper)
assert.deepEqual(
  buildCreateStaffFulfilmentRpcParams({
    method: "pickup",
    delivery: completeDelivery(),
  }),
  { p_fulfilment_method: "pickup", p_delivery: null },
);

// AH. website Whole Cake checkout now sends fulfilment args (Pickup default).
{
  const checkoutSrc = readFileSync(
    resolve(process.cwd(), "src/workspaces/storefront/checkout/actions.ts"),
    "utf8",
  );
  assert.ok(checkoutSrc.includes("submit_guest_preorder"));
  assert.ok(checkoutSrc.includes("p_fulfilment_method"));
  assert.ok(checkoutSrc.includes("p_delivery"));
  assert.ok(checkoutSrc.includes("p_dine_in"));
}

console.log("M4-P2 Slice 3 helper/materiality tests: PASSED");

void runLiveDb();

async function runLiveDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log(
      "SKIP live DB Slice 3 verification (missing Supabase env). Helper suite still PASSED.",
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

  async function deleteFixtureOrder(orderId: string) {
    const steps: Array<{
      label: string;
      run: () => Promise<{ error: { message: string } | null }>;
    }> = [
      {
        label: "payment_allocations",
        run: () =>
          admin.from("payment_allocations").delete().eq("order_id", orderId),
      },
      {
        label: "refunds",
        run: () => admin.from("refunds").delete().eq("order_id", orderId),
      },
      {
        label: "order_adjustments",
        run: () =>
          admin.from("order_adjustments").delete().eq("order_id", orderId),
      },
      {
        // CASCADE removes delivery details, items, complimentary, paid add-ons,
        // paid-addon messages, timeline, confirmation snapshots, etc.
        label: "orders",
        run: () => admin.from("orders").delete().eq("id", orderId),
      },
    ];

    for (const step of steps) {
      const { error } = await step.run();
      if (error) {
        throw new Error(
          `Slice 3 fixture cleanup failed (${step.label}) for ${orderId}: ${error.message}`,
        );
      }
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

    async function createOrder(extra: Record<string, unknown> = {}) {
      const { data, error } = await admin.rpc("create_staff_guest_preorder", {
        p_actor_staff_id: staff!.id,
        p_customer_name: "Amy Slice3",
        p_phone: "0123456789",
        p_email: null,
        p_order_source: "whatsapp",
        p_crew_order: false,
        p_pickup_date: "2026-08-27",
        p_pickup_time: "15:00:00",
        p_pickup_instruction: null,
        p_items: [
          {
            cake_id: size!.cake_id,
            cake_size_id: size!.id,
            quantity: 1,
          },
        ],
        p_complimentary: [
          {
            complimentary_item_type_id: null,
            name: "Candle",
            quantity: 1,
            sort_order: 1,
          },
        ],
        p_include_receipt: false,
        p_needs_bakery_attention: false,
        p_bakery_attention_note: null,
        p_customer_notes: null,
        p_internal_notes: "m4p2-slice3",
        p_paid_addons: [
          {
            code: "birthday_card",
            quantity: 1,
            messages: ["Happy Day"],
          },
        ],
        ...extra,
      });
      if (error) throw new Error(error.message);
      cleanup.push(data.id);
      return data as {
        id: string;
        fulfilment_method: string;
        guest_name: string;
        guest_phone: string;
        pickup_date: string;
        pickup_time: string;
        status: string;
      };
    }

    async function detailsCount(orderId: string) {
      const { data } = await admin
        .from("order_delivery_details")
        .select("order_id")
        .eq("order_id", orderId);
      return data?.length ?? 0;
    }

    async function loadOrder(orderId: string) {
      const { data: order } = await admin
        .from("orders")
        .select(
          "id, fulfilment_method, guest_name, guest_phone, pickup_date, pickup_time, status, confirmation_needs_resend",
        )
        .eq("id", orderId)
        .single();
      const { data: delivery } = await admin
        .from("order_delivery_details")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle();
      const { data: items } = await admin
        .from("order_items")
        .select("cake_id, cake_size_id, quantity, unit_price")
        .eq("order_id", orderId);
      const { data: comps } = await admin
        .from("order_complimentary_items")
        .select("name, quantity")
        .eq("order_id", orderId);
      const { data: addons } = await admin
        .from("order_paid_addons")
        .select("code, quantity, unit_price")
        .eq("order_id", orderId);
      const { data: payments } = await admin
        .from("payment_allocations")
        .select("id, amount")
        .eq("order_id", orderId);
      const { data: adjustments } = await admin
        .from("order_adjustments")
        .select("id, amount")
        .eq("order_id", orderId);
      return {
        order,
        delivery,
        items,
        comps,
        addons,
        payments,
        adjustments,
      };
    }

    /** Mirrors Workspace save fulfilment step after validation. */
    async function workspaceSyncFulfilment(
      orderId: string,
      method: "pickup" | "delivery",
      delivery: DeliveryCreateDraft,
      schedule?: { date: string; time: string },
    ) {
      const err = validateOwnerCreateFulfilment({
        method,
        pickupDate: schedule?.date ?? "2026-08-27",
        pickupTime: schedule?.time ?? "15:00:00",
        delivery,
      });
      if (err) return { error: err, data: null };

      const rpc = buildCreateStaffFulfilmentRpcParams({ method, delivery });
      if (schedule) {
        const { error: updErr } = await admin
          .from("orders")
          .update({
            pickup_date: schedule.date,
            pickup_time: schedule.time,
          })
          .eq("id", orderId);
        if (updErr) return { error: updErr.message, data: null };
      }
      const { data, error } = await admin.rpc("sync_guest_order_fulfilment", {
        p_order_id: orderId,
        p_fulfilment_method: rpc.p_fulfilment_method,
        p_delivery: rpc.p_delivery,
      });
      if (error) return { error: error.message, data: null };
      return { error: null, data };
    }

    // A. Pickup unchanged save
    {
      const created = await createOrder({ p_fulfilment_method: "pickup" });
      const before = await loadOrder(created.id);
      const result = await workspaceSyncFulfilment(
        created.id,
        "pickup",
        defaultDeliveryCreateDraft(),
      );
      const after = await loadOrder(created.id);
      check(result.error == null, "A. Pickup unchanged sync succeeds");
      check(
        after.order?.fulfilment_method === "pickup" &&
          (await detailsCount(created.id)) === 0,
        "A. Pickup unchanged keeps method + zero delivery rows",
      );
      check(
        JSON.stringify(before.items) === JSON.stringify(after.items) &&
          JSON.stringify(before.comps) === JSON.stringify(after.comps) &&
          JSON.stringify(before.addons) === JSON.stringify(after.addons),
        "A/P–S. cakes/complimentary/paid-addons unchanged on Pickup resave",
      );
    }

    // B. Pickup schedule edit
    {
      const created = await createOrder();
      const result = await workspaceSyncFulfilment(
        created.id,
        "pickup",
        defaultDeliveryCreateDraft(),
        { date: "2026-08-28", time: "16:30:00" },
      );
      const after = await loadOrder(created.id);
      check(result.error == null, "B. Pickup schedule edit sync succeeds");
      check(
        String(after.order?.pickup_date).startsWith("2026-08-28") &&
          String(after.order?.pickup_time).startsWith("16:30"),
        "B. Pickup schedule persisted",
      );
      check(
        after.order?.fulfilment_method === "pickup" &&
          (await detailsCount(created.id)) === 0,
        "B. Pickup schedule edit keeps zero delivery rows",
      );
    }

    // C. Pickup → Delivery different recipient
    {
      const created = await createOrder();
      const before = await loadOrder(created.id);
      const result = await workspaceSyncFulfilment(
        created.id,
        "delivery",
        completeDelivery({
          recipientName: "Mum",
          recipientPhone: "0198888888",
          recipientNotifyPreference: "do_not_inform_recipient",
        }),
      );
      const after = await loadOrder(created.id);
      check(result.error == null, "C. Pickup→Delivery different recipient ok");
      check(
        after.order?.fulfilment_method === "delivery" &&
          (await detailsCount(created.id)) === 1,
        "C. Delivery method + exactly one details row",
      );
      check(
        after.delivery?.recipient_name === "Mum" &&
          after.delivery?.recipient_notify_preference ===
            "do_not_inform_recipient" &&
          after.delivery?.city === OWNER_DELIVERY_CITY &&
          after.delivery?.state === OWNER_DELIVERY_STATE,
        "C/O. recipient + KK/Sabah normalization",
      );
      check(
        after.order?.guest_name === before.order?.guest_name &&
          after.order?.guest_phone === before.order?.guest_phone,
        "P. ordered-by identity unchanged",
      );
      check(
        JSON.stringify(before.items) === JSON.stringify(after.items),
        "Q. cakes unchanged",
      );
      check(
        JSON.stringify(before.addons) === JSON.stringify(after.addons),
        "R. paid add-ons unchanged",
      );
      check(
        JSON.stringify(before.comps) === JSON.stringify(after.comps),
        "S. complimentary unchanged",
      );
      check(
        JSON.stringify(before.payments) === JSON.stringify(after.payments),
        "T. payments unchanged",
      );
      const { error: financeProbeErr } = await admin.rpc(
        "current_delivery_processing_fee_default",
      );
      const m4p3FinanceLive = !financeProbeErr;
      if (m4p3FinanceLive) {
        const feeAdj = (after.adjustments ?? []).filter(
          (a) => Number(a.amount) === 5,
        );
        check(
          feeAdj.length >= 1 &&
            after.delivery?.delivery_finance_enabled === true &&
            after.delivery?.delivery_fee_status === "not_set",
          "U. M4-P3 Pickup→Delivery initializes processing (+ Delivery NOT SET)",
        );
      } else {
        check(
          JSON.stringify(before.adjustments) ===
            JSON.stringify(after.adjustments),
          "U. adjustments unchanged (pre-M4-P3)",
        );
      }
    }

    // D. Pickup → Delivery Same as Customer
    {
      const created = await createOrder();
      const draft = copyCustomerToRecipientDraft(completeDelivery(), {
        name: "Amy Slice3",
        phone: "0123456789",
      });
      draft.addressLine1 = "1 Same Street";
      draft.postcode = "88400";
      const result = await workspaceSyncFulfilment(created.id, "delivery", draft);
      const after = await loadOrder(created.id);
      check(result.error == null, "D. Pickup→Delivery Same as Customer ok");
      check(
        after.delivery?.recipient_name === "Amy Slice3" &&
          after.delivery?.recipient_phone === "0123456789" &&
          after.delivery?.recipient_notify_preference === "inform_recipient" &&
          after.order?.guest_name === "Amy Slice3",
        "D. Same-as-Customer persists inform_recipient; identities separate columns",
      );
    }

    // E. incomplete Delivery rejected — no partial mutation
    {
      const created = await createOrder();
      const beforeMethod = (await loadOrder(created.id)).order?.fulfilment_method;
      const result = await workspaceSyncFulfilment(
        created.id,
        "delivery",
        completeDelivery({ postcode: "" }),
      );
      const after = await loadOrder(created.id);
      check(result.error != null, "E. incomplete Delivery blocked");
      check(
        after.order?.fulfilment_method === beforeMethod &&
          (await detailsCount(created.id)) === 0,
        "E. no partial fulfilment mutation",
      );
    }

    // F–I. Delivery→Delivery edits
    {
      const created = await createOrder({
        p_fulfilment_method: "delivery",
        p_delivery: buildCreateStaffFulfilmentRpcParams({
          method: "delivery",
          delivery: completeDelivery(),
        }).p_delivery,
      });
      check(
        (await detailsCount(created.id)) === 1,
        "F setup. Delivery order has details row",
      );

      let result = await workspaceSyncFulfilment(
        created.id,
        "delivery",
        completeDelivery({ recipientName: "Dad" }),
      );
      let after = await loadOrder(created.id);
      check(
        result.error == null && after.delivery?.recipient_name === "Dad",
        "F. Delivery recipient edit",
      );

      result = await workspaceSyncFulfilment(
        created.id,
        "delivery",
        completeDelivery({
          recipientName: "Dad",
          addressLine1: "77 New Ave",
          addressLine2: "Floor 2",
        }),
      );
      after = await loadOrder(created.id);
      check(
        result.error == null &&
          after.delivery?.address_line_1 === "77 New Ave" &&
          after.delivery?.address_line_2 === "Floor 2",
        "G. Delivery address edit",
      );

      result = await workspaceSyncFulfilment(
        created.id,
        "delivery",
        completeDelivery({
          recipientName: "Dad",
          addressLine1: "77 New Ave",
          addressLine2: "Floor 2",
          recipientNotifyPreference: "do_not_inform_recipient",
        }),
      );
      after = await loadOrder(created.id);
      check(
        result.error == null &&
          after.delivery?.recipient_notify_preference ===
            "do_not_inform_recipient",
        "H. Delivery notify edit",
      );

      result = await workspaceSyncFulfilment(
        created.id,
        "delivery",
        completeDelivery({
          recipientName: "Dad",
          addressLine1: "77 New Ave",
          recipientNotifyPreference: "do_not_inform_recipient",
        }),
        { date: "2026-08-29", time: "11:00:00" },
      );
      after = await loadOrder(created.id);
      check(
        result.error == null &&
          String(after.order?.pickup_date).startsWith("2026-08-29") &&
          String(after.order?.pickup_time).startsWith("11:00") &&
          after.order?.fulfilment_method === "delivery" &&
          (await detailsCount(created.id)) === 1,
        "I. Delivery schedule edit keeps single details row",
      );
    }

    // J / K. Delivery → Pickup removes details
    {
      const created = await createOrder({
        p_fulfilment_method: "delivery",
        p_delivery: buildCreateStaffFulfilmentRpcParams({
          method: "delivery",
          delivery: completeDelivery(),
        }).p_delivery,
      });
      const result = await workspaceSyncFulfilment(
        created.id,
        "pickup",
        completeDelivery(), // stale draft must not resurrect
        { date: "2026-08-30", time: "10:00:00" },
      );
      const after = await loadOrder(created.id);
      check(result.error == null, "J. Delivery→Pickup sync succeeds");
      check(
        after.order?.fulfilment_method === "pickup" &&
          (await detailsCount(created.id)) === 0,
        "K. Delivery→Pickup removes details row",
      );
      check(
        String(after.order?.pickup_date).startsWith("2026-08-30"),
        "J. Pickup schedule from draft retained",
      );

      // L. switch back to Delivery — no resurrection of old recipient
      const back = await workspaceSyncFulfilment(
        created.id,
        "delivery",
        completeDelivery({
          recipientName: "Brand New",
          recipientPhone: "0111111111",
          addressLine1: "Fresh Address",
          postcode: "88400",
        }),
      );
      const again = await loadOrder(created.id);
      check(back.error == null, "L. re-Delivery after Pickup succeeds");
      check(
        again.delivery?.recipient_name === "Brand New" &&
          again.delivery?.recipient_name !== "Mum",
        "L. no resurrection of deleted Delivery recipient",
      );
      check(
        (await detailsCount(created.id)) === 1,
        "L. exactly one details row after re-Delivery",
      );
    }

    // X / AE. confirmation invalidation while awaiting_payment preserves status
    {
      const created = await createOrder();
      await admin
        .from("orders")
        .update({ status: "awaiting_payment" })
        .eq("id", created.id);
      const { data: snap } = await admin
        .from("order_confirmation_snapshots")
        .insert({
          order_id: created.id,
          version: 1,
          lifecycle_status: "sent",
          message_body: "pickup confirmation stub",
          snapshot_payload: {},
          sent_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      const result = await workspaceSyncFulfilment(
        created.id,
        "delivery",
        completeDelivery(),
      );
      check(result.error == null, "X. method change sync for confirmation case");

      // Mirror saveOrderWorkspaceAction invalidation side-effects
      if (snap?.id) {
        await admin
          .from("order_confirmation_snapshots")
          .update({
            lifecycle_status: "outdated",
            outdated_at: new Date().toISOString(),
          })
          .eq("id", snap.id)
          .eq("lifecycle_status", "sent");
      }
      await admin
        .from("orders")
        .update({ confirmation_needs_resend: true })
        .eq("id", created.id);

      const after = await loadOrder(created.id);
      const { data: snapAfter } = await admin
        .from("order_confirmation_snapshots")
        .select("lifecycle_status")
        .eq("id", snap!.id)
        .single();
      check(
        after.order?.confirmation_needs_resend === true &&
          snapAfter?.lifecycle_status === "outdated",
        "X. sent confirmation outdated + needs_resend",
      );
      check(
        after.order?.status === "awaiting_payment",
        "AE. awaiting_payment preserved through confirmation invalidation",
      );
    }

    // AF. paid status preserved
    {
      const created = await createOrder();
      await admin.from("orders").update({ status: "paid" }).eq("id", created.id);
      await admin.from("order_confirmation_snapshots").insert({
        order_id: created.id,
        version: 1,
        lifecycle_status: "sent",
        message_body: "stub",
        snapshot_payload: {},
        sent_at: new Date().toISOString(),
      });
      await workspaceSyncFulfilment(
        created.id,
        "delivery",
        completeDelivery({ addressLine1: "Paid Edit Road" }),
      );
      await admin
        .from("orders")
        .update({ confirmation_needs_resend: true })
        .eq("id", created.id);
      const after = await loadOrder(created.id);
      check(
        after.order?.status === "paid" &&
          after.order?.confirmation_needs_resend === true,
        "AF. paid preserved through confirmation invalidation",
      );
    }

    // AG. audit metadata can be recorded (order_updated with fulfilment summaries)
    {
      const created = await createOrder();
      const beforeTruth = fulfilmentTimelineSummary({
        method: "pickup",
        pickupDate: "2026-08-27",
        pickupTime: "15:00:00",
        delivery: null,
      });
      await workspaceSyncFulfilment(created.id, "delivery", completeDelivery());
      const afterTruth = fulfilmentTimelineSummary({
        method: "delivery",
        pickupDate: "2026-08-27",
        pickupTime: "15:00:00",
        delivery: deliveryFromDraft(completeDelivery()),
      });
      const { error: auditErr } = await admin
        .from("order_timeline_events")
        .insert({
          order_id: created.id,
          event_type: "order_updated",
          actor_staff_id: staff!.id,
          metadata: {
            fulfilment_before: beforeTruth,
            fulfilment_after: afterTruth,
          },
        });
      check(auditErr == null, "AG. fulfilment before/after audit metadata recorded");
    }

    // Website submit_guest_preorder remains Pickup (live)
    {
      const { data, error } = await admin.rpc("submit_guest_preorder", {
        p_customer_name: "Web Slice3",
        p_phone: "0199999999",
        p_email: null,
        p_pickup_date: "2026-08-27",
        p_pickup_time: "14:00:00",
        p_notes: null,
        p_items: [
          {
            cake_id: size!.cake_id,
            cake_size_id: size!.id,
            quantity: 1,
          },
        ],
        p_email_submission_receipt_requested: false,
      });
      if (!error && data?.id) cleanup.push(data.id);
      check(error == null, "AH. website submit_guest_preorder succeeds");
      if (data?.id) {
        const loaded = await loadOrder(data.id);
        check(
          loaded.order?.fulfilment_method === "pickup" &&
            (await detailsCount(data.id)) === 0,
          "AH. website order is Pickup with zero delivery rows",
        );
      }
    }
  } catch (error) {
    failed += 1;
    console.error(
      "FAIL  live suite error:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    const cleanupFailures: string[] = [];
    for (const id of cleanup) {
      try {
        await deleteFixtureOrder(id);
      } catch (cleanupError) {
        cleanupFailures.push(
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
        );
      }
    }
    if (cleanupFailures.length > 0) {
      console.error("Slice 3 fixture cleanup failures:");
      for (const message of cleanupFailures) {
        console.error(`  ${message}`);
      }
      failed += cleanupFailures.length;
    }
  }

  console.log(`M4-P2 Slice 3 live DB: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
