/**
 * Live disposable Extra Preorder receipt + complimentary verification.
 * Cleanup always. Does not mutate Product order 7e9779ac-….
 *
 * Run: npx tsx scripts/test-guest-extra-receipt-complimentary-live.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  extraCustomerPickupSlotsForDate,
  isValidExtraCustomerPickup,
} from "@/engines/extra/extra-pickup";
import {
  defaultExtraOrderCutoffSlot,
  defaultExtraPickupFromSlot,
  extraOperatingSlotsForDate,
  extraPickupThroughIso,
} from "@/engines/extra/fresh-picks-eligibility";
import {
  buildConfirmationPayloadFromOrder,
  generateConfirmationMessage,
} from "@/engines/orders/confirmation-message";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import { commercialLinesForSettlement } from "@/engines/orders/totals";
import { addBusinessCalendarDays, toBusinessDateKey } from "@/lib/dates";
import { parseRequiredPhysicalReceipt } from "@/workspaces/storefront/checkout/preorder-draft";
import type { StorefrontOrder } from "@/types/storefront";

const PRODUCT_ORDER_ID = "7e9779ac-152b-42e0-8002-34ba8e9b11b5";
const SIG = "WB-XTRA-RCPT-20260818";
const PHONE = "0190000185";
const EMAIL = "wb-xtra-rcpt-20260818@example.test";
const MIGRATION_HINT =
  "Apply supabase/migrations/20260818150000_guest_extra_include_receipt_complimentary.sql in the SQL Editor, then re-run.";

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

type Check = { label: string; ok: boolean; detail?: string };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log("SKIP live DB (missing Supabase env).");
    return;
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const checks: Check[] = [];
  const extraIds: string[] = [];
  const orderIds: string[] = [];
  console.log(`fixture signature SIG=${SIG}`);

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
    await admin.from("order_complimentary_items").delete().eq("order_id", orderId);
    await admin.from("order_timeline_events").delete().eq("order_id", orderId);
    await admin.from("order_items").delete().eq("order_id", orderId);
    await admin.from("order_confirmation_snapshots").delete().eq("order_id", orderId);
    await admin.from("orders").delete().eq("id", orderId).is("customer_id", null);
  }

  async function leftoverScan() {
    const { data: extras } = await admin
      .from("extra_stock")
      .select("id")
      .or(`note.eq.${SIG},cake_name.ilike.%${SIG}%`);
    const { data: byName } = await admin
      .from("orders")
      .select("id, guest_name")
      .ilike("guest_name", `%${SIG}%`);
    const { data: byPhone } = await admin
      .from("orders")
      .select("id, guest_name")
      .eq("guest_phone", PHONE)
      .is("customer_id", null);
    return {
      extras: extras ?? [],
      orders: [...(byName ?? []), ...(byPhone ?? [])],
    };
  }

  check(parseRequiredPhysicalReceipt("") === null, "unset Yes/No is not submitable");

  try {
    const probe = await admin.rpc("submit_guest_extra_order", {
      p_customer_name: "Probe",
      p_phone: "000",
      p_email: null,
      p_pickup_date: toBusinessDateKey(),
      p_pickup_time: "12:00",
      p_notes: SIG,
      p_extra_stock_id: "00000000-0000-0000-0000-000000000000",
      p_include_receipt: false,
      p_complimentary: [],
    });
    if (probe.error?.message?.includes("Could not find the function")) {
      throw new Error(`RPC missing new Extra params. ${MIGRATION_HINT}`);
    }

    const { data: roles } = await admin.from("roles").select("id, code");
    const roleByCode = new Map((roles ?? []).map((r) => [r.code, r.id]));
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
      .select("id, name, library_cake_sizes ( id, label, price )")
      .in("status", ["active", "seasonal"])
      .limit(1)
      .maybeSingle();
    type SizeEmbed = { id: string; label: string; price: number | string };
    const sizes = (cake?.library_cake_sizes ?? []) as SizeEmbed[];
    const size = sizes[0];
    if (!cake?.id || !size?.id) throw new Error("Need an active Library cake/size");
    const cakePrice = Number(size.price);

    const todayYmd = toBusinessDateKey();
    const tomorrowYmd = addBusinessCalendarDays(todayYmd, 1);
    if (!tomorrowYmd) throw new Error("tomorrow missing");
    const now = new Date();
    const todayFrom =
      defaultExtraPickupFromSlot({
        pickupFromDate: todayYmd,
        todayYmd,
        now,
      }) ?? extraOperatingSlotsForDate(todayYmd)[0]?.value;
    const todayCutoff = defaultExtraOrderCutoffSlot({
      cutoffDate: todayYmd,
      todayYmd,
      now,
    });
    const tomorrowFrom =
      defaultExtraPickupFromSlot({
        pickupFromDate: tomorrowYmd,
        todayYmd,
        now,
      }) ?? "12:00";
    const tomorrowCutoff =
      defaultExtraOrderCutoffSlot({
        cutoffDate: tomorrowYmd,
        todayYmd,
        now,
      }) ?? extraOperatingSlotsForDate(tomorrowYmd).at(-1)?.value ?? "17:30";

    const orderFromDate = todayCutoff ? todayYmd : tomorrowYmd;
    const orderFrom =
      (orderFromDate === todayYmd ? todayFrom : tomorrowFrom) ?? "12:00";
    const orderCutoff =
      (orderFromDate === todayYmd ? todayCutoff : tomorrowCutoff) ?? "17:30";
    const orderFromIso = extraPickupThroughIso(orderFromDate, orderFrom);
    const orderCutoffIso = extraPickupThroughIso(orderFromDate, orderCutoff);
    const remainingSlots = extraCustomerPickupSlotsForDate(
      orderFromDate,
      { pickupAvailableFromAt: orderFromIso!, orderCutoffAt: orderCutoffIso! },
      now,
    );
    const pickupSlot =
      remainingSlots.find((slot) =>
        isValidExtraCustomerPickup({
          pickupDate: orderFromDate,
          pickupTime: slot.value,
          pickupAvailableFromAt: orderFromIso!,
          orderCutoffAt: orderCutoffIso!,
          now,
        }),
      )?.value ?? remainingSlots.at(-1)?.value;
    if (!pickupSlot || !orderFromIso || !orderCutoffIso) {
      throw new Error("No remaining Extra pickup slot for live verification");
    }

    const { data: collection } = await admin.rpc(
      "storefront_collection_for_pickup_date",
      { p_pickup_date: orderFromDate },
    );
    const collectionId = (Array.isArray(collection) ? collection[0] : collection)
      ?.id as string | undefined;
    const { data: options } = collectionId
      ? await admin.rpc("storefront_customer_preorder_options", {
          p_collection_id: collectionId,
        })
      : { data: { complimentary: [] } };
    const complimentary = (options?.complimentary ?? []) as Array<{
      typeId: string;
      code: string;
      name: string;
    }>;
    check(
      complimentary.length > 0,
      "pickup-date complimentary catalogue available",
      complimentary.map((row) => row.code).join(","),
    );

    async function proposeAndConfirm(suffix: string) {
      const { data, error } = await admin.rpc("propose_extra_stock", {
        p_actor_staff_id: actor.id,
        p_cake_name: `${SIG} ${suffix}`,
        p_size_label: size.label,
        p_prepared_on: orderFromDate,
        p_note: SIG,
        p_library_cake_id: cake.id,
        p_library_cake_size_id: size.id,
      });
      const id = data?.id as string | undefined;
      if (id) extraIds.push(id);
      if (error || !id) {
        return { id: "", error: error?.message ?? "propose failed" };
      }
      const { error: cErr } = await admin.rpc("confirm_extra_stock", {
        p_extra_stock_id: id,
        p_actor_staff_id: actor.id,
        p_prepared_on: orderFromDate,
        p_pickup_available_from_at: orderFromIso,
        p_pickup_through_at: orderCutoffIso,
      });
      return { id, error: cErr?.message ?? null };
    }

    async function submit(input: {
      suffix: string;
      extraId: string;
      emailReceipt: boolean;
      includeReceipt: boolean;
      complimentary: Array<{ type_id: string; code: string; quantity: number }>;
    }) {
      const { data, error } = await admin.rpc("submit_guest_extra_order", {
        p_customer_name: `${SIG} ${input.suffix}`,
        p_phone: PHONE,
        p_email: input.emailReceipt ? EMAIL : null,
        p_pickup_date: orderFromDate,
        p_pickup_time: pickupSlot,
        p_notes: `${SIG} disposable`,
        p_extra_stock_id: input.extraId,
        p_email_submission_receipt_requested: input.emailReceipt,
        p_include_receipt: input.includeReceipt,
        p_complimentary: input.complimentary,
      });
      const id =
        data && typeof data === "object" && "id" in data
          ? String((data as { id: string }).id)
          : "";
      if (id) orderIds.push(id);
      return { id, error: error?.message ?? null };
    }

    async function loadOrder(orderId: string) {
      const { data: order, error } = await admin
        .from("orders")
        .select(
          "id, guest_name, guest_phone, guest_email, pickup_date, pickup_time, status, fulfilment_method, include_receipt, email_submission_receipt_requested, customer_id, extra_stock_id, collection_id",
        )
        .eq("id", orderId)
        .maybeSingle();
      if (error || !order) throw new Error(error?.message ?? "order missing");
      const { data: orderItems } = await admin
        .from("order_items")
        .select("cake_name, size_label, quantity, unit_price")
        .eq("order_id", orderId);
      const { data: comps } = await admin
        .from("order_complimentary_items")
        .select("name, quantity")
        .eq("order_id", orderId);
      return {
        order,
        orderItems: orderItems ?? [],
        comps: comps ?? [],
      };
    }

    function confirmationFor(loaded: Awaited<ReturnType<typeof loadOrder>>) {
      const mappedItems = loaded.orderItems.map((row, index) => ({
        id: String(index),
        cakeId: "",
        cakeSizeId: "",
        cakeName: String(row.cake_name),
        sizeLabel: String(row.size_label),
        quantity: Number(row.quantity),
        unitPrice: Number(row.unit_price),
      }));
      const complimentaryItems = loaded.comps.map((row, index) => ({
        id: String(index),
        name: String(row.name),
        quantity: Number(row.quantity),
        sortOrder: index,
        complimentaryItemTypeId: null,
      }));
      const settlement = calculateOrderSettlement({
        items: commercialLinesForSettlement({
          items: mappedItems,
          paidAddons: [],
        }),
        adjustments: [],
        allocations: [],
        refunds: [],
      });
      const storefront = {
        id: String(loaded.order.id),
        orderNumber: "TEST",
        customerName: String(loaded.order.guest_name ?? ""),
        phone: String(loaded.order.guest_phone ?? ""),
        email: loaded.order.guest_email ?? "",
        pickupDate: String(loaded.order.pickup_date),
        pickupTime: String(loaded.order.pickup_time),
        fulfilmentMethod: "pickup" as const,
        delivery: null,
        notes: "",
        status: "submitted",
        createdAt: "",
        confirmationNeedsResend: false,
        collectionId: loaded.order.collection_id,
        orderSource: "customer_website" as const,
        crewOrder: false,
        includeReceipt: Boolean(loaded.order.include_receipt),
        items: mappedItems,
        paidAddons: [],
        complimentaryItems,
        total: settlement.amountDue,
        adjustments: [],
        paymentAllocations: [],
        refunds: [],
        settlement,
      } as StorefrontOrder;
      const payload = buildConfirmationPayloadFromOrder({
        order: storefront,
        staffCustomerFacingName: "Amy",
      });
      return {
        customer: generateConfirmationMessage(payload),
        amountDue: settlement.amountDue,
        includeReceipt: storefront.includeReceipt,
        emailRequested: Boolean(loaded.order.email_submission_receipt_requested),
      };
    }

    async function extraFor(suffix: string) {
      const created = await proposeAndConfirm(suffix);
      check(created.error == null, `confirm Extra ${suffix}`, created.error ?? undefined);
      return created.id;
    }

    const oneComp = complimentary[0]
      ? [{ type_id: complimentary[0].typeId, code: complimentary[0].code, quantity: 1 }]
      : [];
    const allComp = complimentary.map((row) => ({
      type_id: row.typeId,
      code: row.code,
      quantity: 1,
    }));

    const aExtra = await extraFor("A");
    const a = aExtra
      ? await submit({
          suffix: "A-ReceiptNo",
          extraId: aExtra,
          emailReceipt: false,
          includeReceipt: false,
          complimentary: [],
        })
      : { id: "", error: "no extra" };
    check(a.error == null, "A Extra receipt=NO submit", a.error ?? undefined);
    if (a.id) {
      const loaded = await loadOrder(a.id);
      const conf = confirmationFor(loaded);
      check(loaded.order.collection_id == null, "A Extra stays collection_id null");
      check(conf.includeReceipt === false, "A include_receipt false");
      check(conf.emailRequested === false, "A email-copy false");
      check(loaded.comps.length === 0, "A no complimentary rows");
      check(!conf.customer.includes("*Include RECEIPT"), "A confirmation has no *Include RECEIPT");
      check(!conf.customer.includes("*Complimentary"), "A confirmation has no complimentary line");
      check(conf.amountDue === cakePrice, "A total equals Extra cake price", String(conf.amountDue));
    }

    const bExtra = await extraFor("B");
    const b = bExtra
      ? await submit({
          suffix: "B-Comp-ReceiptYes",
          extraId: bExtra,
          emailReceipt: false,
          includeReceipt: true,
          complimentary: oneComp,
        })
      : { id: "", error: "no extra" };
    check(b.error == null, "B Extra complimentary + receipt=YES", b.error ?? undefined);
    if (b.id) {
      const loaded = await loadOrder(b.id);
      const conf = confirmationFor(loaded);
      check(conf.includeReceipt === true, "B include_receipt true");
      check(conf.emailRequested === false, "B email-copy false");
      check(loaded.comps.length === oneComp.length, "B complimentary row persisted");
      check(conf.customer.includes("*Include RECEIPT"), "B confirmation has *Include RECEIPT");
      if (oneComp.length > 0) {
        check(conf.customer.includes("*Complimentary"), "B confirmation has complimentary");
      }
      check(conf.amountDue === cakePrice, "B complimentary did not change total", String(conf.amountDue));
    }

    const cExtra = await extraFor("C");
    const c = cExtra
      ? await submit({
          suffix: "C-EmailYes-ReceiptNo",
          extraId: cExtra,
          emailReceipt: true,
          includeReceipt: false,
          complimentary: [],
        })
      : { id: "", error: "no extra" };
    check(c.error == null, "C Extra email=YES receipt=NO", c.error ?? undefined);
    if (c.id) {
      const loaded = await loadOrder(c.id);
      const conf = confirmationFor(loaded);
      check(conf.emailRequested === true, "C email-copy true");
      check(conf.includeReceipt === false, "C include_receipt false");
      check(!conf.customer.includes("*Include RECEIPT"), "C confirmation has no *Include RECEIPT");
    }

    const dExtra = await extraFor("D");
    const d = dExtra
      ? await submit({
          suffix: "D-EmailYes-ReceiptYes",
          extraId: dExtra,
          emailReceipt: true,
          includeReceipt: true,
          complimentary: [],
        })
      : { id: "", error: "no extra" };
    check(d.error == null, "D Extra email=YES receipt=YES", d.error ?? undefined);
    if (d.id) {
      const loaded = await loadOrder(d.id);
      const conf = confirmationFor(loaded);
      check(conf.emailRequested === true, "D email-copy true");
      check(conf.includeReceipt === true, "D include_receipt true");
      check(conf.customer.includes("*Include RECEIPT"), "D confirmation has *Include RECEIPT");
    }

    const eExtra = await extraFor("E");
    const e = eExtra
      ? await submit({
          suffix: "E-MultiComp",
          extraId: eExtra,
          emailReceipt: false,
          includeReceipt: true,
          complimentary: allComp,
        })
      : { id: "", error: "no extra" };
    check(e.error == null, "E Extra multiple complimentary", e.error ?? undefined);
    if (e.id) {
      const loaded = await loadOrder(e.id);
      const conf = confirmationFor(loaded);
      check(
        loaded.comps.length === allComp.length,
        "E complimentary rows match selection",
        `${loaded.comps.length}/${allComp.length}`,
      );
      check(conf.amountDue === cakePrice, "E total unchanged by complimentary", String(conf.amountDue));
      check(conf.includeReceipt === true, "E include_receipt true");
      if (allComp.length > 1) {
        check(conf.customer.includes("*Complimentary"), "E confirmation complimentary line");
      }
    }

    check(
      orderIds.every((id) => id !== PRODUCT_ORDER_ID),
      "did not touch Product order",
    );
  } catch (error) {
    fail("live suite", error instanceof Error ? error.message : String(error));
  } finally {
    for (const id of orderIds) {
      await cleanupOrder(id);
    }
    const leftoverOrders = await leftoverScan();
    for (const row of leftoverOrders.orders) {
      await cleanupOrder(row.id as string);
    }
    const extraCleanupIds = [
      ...new Set([
        ...extraIds,
        ...leftoverOrders.extras.map((row) => row.id as string),
      ]),
    ];
    if (extraCleanupIds.length > 0) {
      const { data: extraOrders } = await admin
        .from("orders")
        .select("id")
        .in("extra_stock_id", extraCleanupIds);
      for (const row of extraOrders ?? []) {
        await cleanupOrder(row.id as string);
      }
      await admin.from("extra_stock").delete().in("id", extraCleanupIds);
    }
    const leftovers = await leftoverScan();
    check(
      leftovers.extras.length === 0 && leftovers.orders.length === 0,
      "zero leftover SIG/phone Extra rows",
      leftovers.extras.length === 0 && leftovers.orders.length === 0
        ? undefined
        : `extras=${leftovers.extras.length} orders=${leftovers.orders.length}`,
    );
  }

  const failed = checks.filter((row) => !row.ok);
  if (failed.length > 0) {
    console.error(`FAIL extra receipt/complimentary live (${failed.length})`);
    process.exit(1);
  }
  console.log("PASS extra receipt/complimentary live");
}

void main();
