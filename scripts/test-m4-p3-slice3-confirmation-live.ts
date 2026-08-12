/**
 * M4-P3 Slice 3 — live Confirmation equation + waiver + Payment Request.
 *
 * Isolated fixtures only. Never mutates Product order
 * 7e9779ac-152b-42e0-8002-34ba8e9b11b5.
 *
 * Run: npx tsx scripts/test-m4-p3-slice3-confirmation-live.ts
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildConfirmationPayloadFromOrder,
  formatConfirmationAmountSection,
  generateConfirmationMessage,
} from "@/engines/orders/confirmation-message";
import {
  financialMateriallyAffectsConfirmation,
  shouldWarnMissingDeliveryFeeBeforeConfirmation,
} from "@/engines/orders/confirmation-validity";
import {
  DELIVERY_FEE_CODE,
  DELIVERY_PROCESSING_FEE_CODE,
} from "@/engines/orders/delivery-finance";
import { mapOrderDeliveryDetails } from "@/engines/orders/fulfilment";
import {
  customerFacingAdjustmentLabel,
  formatPaymentRequestAmountBlock,
} from "@/engines/orders/payment-message";
import { getEffectiveAdjustments } from "@/engines/orders/promotions";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import { commercialLinesForSettlement } from "@/engines/orders/totals";
import type { StorefrontOrder } from "@/types/storefront";
import { buildGuestOrderWorkspaceCapabilities } from "@/engines/orders/delivery-finance-capabilities";

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

const SIG = `M4P3S3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PRODUCT_ORDER_ID = "7e9779ac-152b-42e0-8002-34ba8e9b11b5";

type Check = { label: string; ok: boolean; detail?: string };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log("SKIP live DB (missing Supabase env).");
    process.exit(0);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const checks: Check[] = [];
  const orderIds: string[] = [];

  function pass(label: string, detail?: string) {
    checks.push({ label, ok: true, detail });
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  }
  function fail(label: string, detail?: string) {
    checks.push({ label, ok: false, detail });
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
  function check(condition: boolean, label: string, detail?: string) {
    if (condition) pass(label, detail);
    else fail(label, detail);
  }

  async function cleanupOrder(orderId: string) {
    for (const step of [
      () =>
        admin
          .from("order_confirmation_snapshots")
          .delete()
          .eq("order_id", orderId),
      () =>
        admin.from("order_timeline_events").delete().eq("order_id", orderId),
      () => admin.from("order_adjustments").delete().eq("order_id", orderId),
      () => admin.from("orders").delete().eq("id", orderId),
    ]) {
      const { error } = await step();
      if (error) {
        throw new Error(`cleanup failed for ${orderId}: ${error.message}`);
      }
    }
  }

  async function loadStorefrontOrder(orderId: string): Promise<StorefrontOrder> {
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select(
        "id, order_number, guest_name, guest_phone, pickup_date, pickup_time, status, confirmation_needs_resend, fulfilment_method",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr || !order) {
      throw new Error(orderErr?.message ?? "order missing");
    }

    const { data: items, error: itemErr } = await admin
      .from("order_items")
      .select("id, cake_id, cake_size_id, cake_name, size_label, quantity, unit_price")
      .eq("order_id", orderId);
    if (itemErr) throw itemErr;

    const { data: deliveryRow, error: delErr } = await admin
      .from("order_delivery_details")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();
    if (delErr) throw delErr;

    const { data: adjustments, error: adjErr } = await admin
      .from("order_adjustments")
      .select("id, label, amount, code, metadata, status, reverses_adjustment_id")
      .eq("order_id", orderId);
    if (adjErr) throw adjErr;

    const mappedItems = (items ?? []).map((row) => ({
      id: String(row.id),
      cakeId: String(row.cake_id),
      cakeSizeId: String(row.cake_size_id),
      cakeName: String(row.cake_name),
      sizeLabel: String(row.size_label),
      quantity: Number(row.quantity),
      unitPrice: Number(row.unit_price),
    }));
    const mappedAdjustments = (adjustments ?? []).map((row) => ({
      id: String(row.id),
      label: String(row.label),
      amount: Number(row.amount),
      code: String(row.code ?? ""),
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      status: String(row.status ?? "active"),
      reversesAdjustmentId: row.reverses_adjustment_id
        ? String(row.reverses_adjustment_id)
        : null,
      createdAt: "",
    }));
    const effective = getEffectiveAdjustments(mappedAdjustments);
    const settlement = calculateOrderSettlement({
      items: commercialLinesForSettlement({
        items: mappedItems,
        paidAddons: [],
      }),
      adjustments: effective,
      allocations: [],
      refunds: [],
    });

    return {
      id: String(order.id),
      orderNumber: String(order.order_number),
      status: order.status,
      customerName: String(order.guest_name ?? ""),
      phone: String(order.guest_phone ?? ""),
      email: "",
      orderSource: "whatsapp",
      crewOrder: false,
      pickupDate: String(order.pickup_date),
      pickupTime: String(order.pickup_time),
      fulfilmentMethod: order.fulfilment_method,
      delivery: mapOrderDeliveryDetails(deliveryRow),
      confirmationNeedsResend: Boolean(order.confirmation_needs_resend),
      items: mappedItems,
      complimentaryItems: [],
      paidAddons: [],
      adjustments: mappedAdjustments,
      paymentAllocations: [],
      settlement,
    } as StorefrontOrder;
  }

  try {
    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .eq("code", "owner")
      .maybeSingle();
    if (!ownerRole?.id) throw new Error("owner role missing");
    const { data: owned } = await admin
      .from("staff_profiles")
      .select("id")
      .eq("role_id", ownerRole.id)
      .limit(1)
      .maybeSingle();
    if (!owned?.id) throw new Error("No owner staff_profiles");
    const ownerId = owned.id;

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
    const cakePrice = Number(size.price);

    const deliveryPayload = {
      recipient_name: `${SIG} Recipient`,
      recipient_phone: "0177003001",
      address_line_1: "3 Slice3 Road",
      address_line_2: null,
      postcode: "88400",
      city: "Kota Kinabalu",
      state: "Sabah",
      recipient_notify_preference: "inform_recipient",
    };

    async function createOrder(
      label: string,
      fulfilment: "pickup" | "delivery",
    ): Promise<string> {
      const { data, error } = await admin.rpc("create_staff_guest_preorder", {
        p_actor_staff_id: ownerId,
        p_customer_name: `${SIG} ${label}`,
        p_phone: "0177003001",
        p_email: null,
        p_order_source: "whatsapp",
        p_crew_order: false,
        p_pickup_date: "2026-09-18",
        p_pickup_time: "15:00:00",
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
        p_internal_notes: `${SIG}-${label}`,
        p_fulfilment_method: fulfilment,
        p_delivery: fulfilment === "delivery" ? deliveryPayload : null,
      });
      if (error || !data?.id) {
        throw new Error(error?.message ?? "create failed");
      }
      const id = String(data.id);
      if (id === PRODUCT_ORDER_ID) {
        throw new Error("refused to use Product order as fixture");
      }
      orderIds.push(id);
      return id;
    }

    const managerCaps = buildGuestOrderWorkspaceCapabilities({
      role: "manager",
      staffId: "mgr-live",
    });
    check(
      managerCaps.canPrepareConfirmation === false &&
        managerCaps.canManagePayments === false &&
        managerCaps.canManageDiscounts === false &&
        managerCaps.canEditOrderWorkspace === false &&
        managerCaps.canEnableDeliveryFinance === false,
      "Manager still has no Confirmation/Payment/Discount/Edit/Enable Charges",
    );

    // Pickup
    {
      const pickupId = await createOrder("PICKUP", "pickup");
      const order = await loadStorefrontOrder(pickupId);
      check(
        shouldWarnMissingDeliveryFeeBeforeConfirmation(order) === false,
        "Pickup — no missing-fee warning",
      );
      const amount = formatConfirmationAmountSection(
        buildConfirmationPayloadFromOrder({
          order,
          staffCustomerFacingName: "Wee",
        }),
      );
      check(
        !amount.includes("(Processing)") &&
          !amount.includes("(Delivery)") &&
          !amount.includes("Waived"),
        "Pickup — no fee terms / waiver lines",
        amount,
      );
    }

    // Delivery NOT SET
    {
      const notSetId = await createOrder("NOTSET", "delivery");
      const order = await loadStorefrontOrder(notSetId);
      check(
        shouldWarnMissingDeliveryFeeBeforeConfirmation(order) === true,
        "NOT SET — warning before Confirmation",
      );
      const payload = buildConfirmationPayloadFromOrder({
        order,
        staffCustomerFacingName: "Wee",
      });
      const amount = formatConfirmationAmountSection(payload);
      const body = generateConfirmationMessage(payload);
      check(
        amount.includes("(Processing)") &&
          !amount.includes("(Delivery)") &&
          !amount.includes("Delivery Fee: Waived"),
        "NOT SET — Processing only, no Delivery waiver line",
        amount,
      );
      check(
        Math.abs(order.settlement.amountDue - (cakePrice + 5)) < 0.001,
        "NOT SET — amountDue = cake + Processing",
      );
      check(
        body.includes(amount) && !body.includes("Delivery Fee: Waived"),
        "NOT SET — Confirmation body matches amount section",
      );
    }

    // Quoted RM15 + Payment Request + override/waive/restore + freeze
    {
      const quotedId = await createOrder("QUOTED", "delivery");
      const { error: quoteErr } = await admin.rpc(
        "set_guest_order_delivery_fee_quote",
        {
          p_order_id: quotedId,
          p_actor_staff_id: ownerId,
          p_amount: 15,
        },
      );
      if (quoteErr) throw quoteErr;

      let order = await loadStorefrontOrder(quotedId);
      check(
        shouldWarnMissingDeliveryFeeBeforeConfirmation(order) === false,
        "Quoted RM15 — no missing-fee warning",
      );
      let payload = buildConfirmationPayloadFromOrder({
        order,
        staffCustomerFacingName: "Wee",
      });
      let amount = formatConfirmationAmountSection(payload);
      check(
        amount.includes("(Processing)") &&
          amount.includes("(Delivery)") &&
          !amount.includes("Waived") &&
          Math.abs(order.settlement.amountDue - (cakePrice + 5 + 15)) < 0.001,
        "Quoted RM15 — full equation, no waiver lines",
        amount,
      );

      const paymentBlock = formatPaymentRequestAmountBlock({
        commercialSubtotal: order.settlement.subtotal,
        amountDue: order.settlement.amountDue,
        netReceived: 0,
        remainingBalance: order.settlement.amountDue,
        adjustments: getEffectiveAdjustments(order.adjustments).map((row) => ({
          label: row.label,
          amount: row.amount,
          code: row.code,
          metadata: row.metadata,
        })),
      });
      check(
        paymentBlock.includes("Processing Fee:") &&
          paymentBlock.includes("Delivery Fee:") &&
          !paymentBlock.includes("Waived"),
        "Payment Request — Processing Fee / Delivery Fee, no waiver lines",
        paymentBlock,
      );
      check(
        customerFacingAdjustmentLabel({
          label: "Delivery Processing Fee",
          amount: 5,
          code: DELIVERY_PROCESSING_FEE_CODE,
        }) === "Processing Fee" &&
          customerFacingAdjustmentLabel({
            label: "Delivery Fee",
            amount: 15,
            code: DELIVERY_FEE_CODE,
          }) === "Delivery Fee",
        "Payment Request labels unchanged",
      );

      const { error: overrideErr } = await admin.rpc(
        "override_guest_order_processing_fee",
        {
          p_order_id: quotedId,
          p_actor_staff_id: ownerId,
          p_amount: 3,
          p_reason: "slice3-live",
        },
      );
      if (overrideErr) throw overrideErr;
      order = await loadStorefrontOrder(quotedId);
      amount = formatConfirmationAmountSection(
        buildConfirmationPayloadFromOrder({
          order,
          staffCustomerFacingName: "Wee",
        }),
      );
      check(
        amount.includes("(Processing)") &&
          amount.includes("(Delivery)") &&
          !amount.includes("Processing Fee: Waived") &&
          Math.abs(order.settlement.amountDue - (cakePrice + 3 + 15)) < 0.001,
        "Processing override RM3 — no Processing waiver line",
        amount,
      );

      const { error: waiveProcErr } = await admin.rpc(
        "waive_guest_order_processing_fee",
        {
          p_order_id: quotedId,
          p_actor_staff_id: ownerId,
        },
      );
      if (waiveProcErr) throw waiveProcErr;
      order = await loadStorefrontOrder(quotedId);
      amount = formatConfirmationAmountSection(
        buildConfirmationPayloadFromOrder({
          order,
          staffCustomerFacingName: "Wee",
        }),
      );
      check(
        amount.includes("Processing Fee: Waived") &&
          !amount.includes("(Processing)") &&
          amount.includes("(Delivery)"),
        "Processing waived + Delivery RM15",
        amount,
      );

      const { error: restoreProcErr } = await admin.rpc(
        "restore_guest_order_processing_fee",
        {
          p_order_id: quotedId,
          p_actor_staff_id: ownerId,
        },
      );
      if (restoreProcErr) throw restoreProcErr;
      order = await loadStorefrontOrder(quotedId);
      amount = formatConfirmationAmountSection(
        buildConfirmationPayloadFromOrder({
          order,
          staffCustomerFacingName: "Wee",
        }),
      );
      check(
        !amount.includes("Processing Fee: Waived") &&
          amount.includes("(Processing)") &&
          Math.abs(order.settlement.amountDue - (cakePrice + 3 + 15)) < 0.001,
        "Processing restored — override RM3 returns, no waiver line",
        amount,
      );

      const { error: waiveDelErr } = await admin.rpc(
        "waive_guest_order_delivery_fee",
        {
          p_order_id: quotedId,
          p_actor_staff_id: ownerId,
        },
      );
      if (waiveDelErr) throw waiveDelErr;
      order = await loadStorefrontOrder(quotedId);
      payload = buildConfirmationPayloadFromOrder({
        order,
        staffCustomerFacingName: "Wee",
      });
      const sentBody = generateConfirmationMessage(payload);
      amount = formatConfirmationAmountSection(payload);
      check(
        amount.includes("Delivery Fee: Waived") &&
          !amount.includes("(Delivery)") &&
          amount.includes("(Processing)"),
        "Delivery waived — equation + Delivery Fee: Waived",
        amount,
      );

      const beforeAmountDue = order.settlement.amountDue;
      const { error: snapErr } = await admin
        .from("order_confirmation_snapshots")
        .insert({
          order_id: quotedId,
          version: 1,
          lifecycle_status: "sent",
          message_body: sentBody,
          snapshot_payload: payload,
          sent_at: new Date().toISOString(),
        });
      if (snapErr) throw snapErr;

      const { error: restoreDelErr } = await admin.rpc(
        "restore_guest_order_delivery_fee",
        {
          p_order_id: quotedId,
          p_actor_staff_id: ownerId,
        },
      );
      if (restoreDelErr) throw restoreDelErr;
      order = await loadStorefrontOrder(quotedId);
      const liveAfterRestore = generateConfirmationMessage(
        buildConfirmationPayloadFromOrder({
          order,
          staffCustomerFacingName: "Wee",
        }),
      );
      const { data: frozen } = await admin
        .from("order_confirmation_snapshots")
        .select("message_body")
        .eq("order_id", quotedId)
        .eq("version", 1)
        .maybeSingle();
      check(
        frozen?.message_body === sentBody &&
          String(frozen?.message_body).includes("Delivery Fee: Waived"),
        "Frozen sent message_body still contains original waiver wording",
      );
      check(
        liveAfterRestore.includes("(Delivery)") &&
          !liveAfterRestore.includes("Delivery Fee: Waived"),
        "Live Confirmation after restore shows quoted Delivery, no waiver line",
      );
      check(
        financialMateriallyAffectsConfirmation(
          beforeAmountDue,
          order.settlement.amountDue,
        ) === true,
        "Restore Delivery is Confirmation-material (amountDue change)",
      );
    }
  } finally {
    for (const id of [...orderIds].reverse()) {
      try {
        await cleanupOrder(id);
      } catch (error) {
        console.error(
          `cleanup warning ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  const failed = checks.filter((row) => !row.ok);
  console.log(
    `\nM4-P3 Slice 3 live Confirmation: ${checks.filter((r) => r.ok).length}/${checks.length} passed`,
  );
  if (failed.length > 0) {
    for (const row of failed) {
      console.error(`  FAIL ${row.label}${row.detail ? ` — ${row.detail}` : ""}`);
    }
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
