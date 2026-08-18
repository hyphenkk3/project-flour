/**
 * Live disposable verification of physical receipt request
 * (orders.include_receipt via submit_guest_preorder p_include_receipt).
 * Independent of email_submission_receipt_requested.
 * Cleanup always. Does not mutate Product order 7e9779ac-….
 *
 * Run: npx tsx scripts/test-guest-preorder-include-receipt-live.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  buildConfirmationPayloadFromOrder,
  generateConfirmationMessage,
} from "@/engines/orders/confirmation-message";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import { commercialLinesForSettlement } from "@/engines/orders/totals";
import { parseRequiredPhysicalReceipt } from "@/workspaces/storefront/checkout/preorder-draft";
import type { StorefrontOrder } from "@/types/storefront";

const PRODUCT_ORDER_ID = "7e9779ac-152b-42e0-8002-34ba8e9b11b5";
const SIG = "WB-RCPT-20260818";
const PHONE = "0190000184";
const PICKUP_DATE = "2026-08-19";
const PICKUP_TIME = "15:00";
const EMAIL = "wb-rcpt-20260818@example.test";

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
    const { data: addons } = await admin
      .from("order_paid_addons")
      .select("id")
      .eq("order_id", orderId);
    for (const addon of addons ?? []) {
      await admin
        .from("order_paid_addon_messages")
        .delete()
        .eq("order_paid_addon_id", addon.id);
    }
    await admin.from("order_paid_addons").delete().eq("order_id", orderId);
    await admin.from("order_complimentary_items").delete().eq("order_id", orderId);
    await admin.from("order_timeline_events").delete().eq("order_id", orderId);
    await admin.from("order_items").delete().eq("order_id", orderId);
    await admin.from("order_confirmation_snapshots").delete().eq("order_id", orderId);
    await admin.from("orders").delete().eq("id", orderId).is("customer_id", null);
  }

  async function leftoverScan() {
    const { data: byName } = await admin
      .from("orders")
      .select("id, guest_name")
      .ilike("guest_name", `%${SIG}%`);
    const { data: byPhone } = await admin
      .from("orders")
      .select("id, guest_name, guest_phone")
      .eq("guest_phone", PHONE)
      .is("customer_id", null);
    return [...(byName ?? []), ...(byPhone ?? [])];
  }

  check(parseRequiredPhysicalReceipt("") === null, "unset Yes/No is not submitable");
  check(parseRequiredPhysicalReceipt("yes") === true, "Yes maps to include_receipt true");
  check(parseRequiredPhysicalReceipt("no") === false, "No maps to include_receipt false");

  try {
    const { data: collection, error: colErr } = await admin.rpc(
      "storefront_collection_for_pickup_date",
      { p_pickup_date: PICKUP_DATE },
    );
    if (colErr || !collection) {
      throw new Error(colErr?.message ?? "collection missing");
    }
    const collectionId = (Array.isArray(collection) ? collection[0] : collection)
      .id as string;

    const { data: cakeRows, error: cakeErr } = await admin
      .from("collection_cakes")
      .select(
        `
        library_cakes (
          id, name, status,
          library_cake_sizes ( id, label, price )
        )
      `,
      )
      .eq("collection_id", collectionId)
      .eq("available", true);
    if (cakeErr) throw new Error(cakeErr.message);

    type Size = { id: string; label: string; price: number };
    type Cake = {
      id: string;
      name: string;
      status: string;
      library_cake_sizes: Size[] | null;
    };
    const pistachio = (cakeRows ?? [])
      .map((row) => {
        const cakes = row.library_cakes as Cake | Cake[] | null;
        return Array.isArray(cakes) ? cakes[0] : cakes;
      })
      .find(
        (cake) =>
          cake &&
          /pistachio chocolate/i.test(cake.name) &&
          /less sweet/i.test(cake.name) &&
          (cake.status === "active" || cake.status === "seasonal"),
      );
    const size = pistachio?.library_cake_sizes?.find((row) =>
      String(row.label).includes("6"),
    );
    if (!pistachio || !size) {
      throw new Error('Pistachio Chocolate 6" (Less Sweet) not in live catalogue');
    }
    check(Number(size.price) === 135, "catalogue cake price RM135", String(size.price));

    const items = [
      { cake_id: pistachio.id, cake_size_id: size.id, quantity: 1 },
    ];

    const { data: options } = await admin.rpc(
      "storefront_customer_preorder_options",
      { p_collection_id: collectionId },
    );
    const complimentary = (options?.complimentary ?? []) as Array<{
      typeId: string;
      code: string;
      name: string;
      sortOrder: number;
    }>;

    async function submit(input: {
      suffix: string;
      complimentary: Array<{ type_id: string; code: string; quantity: number }>;
      paidAddons: Array<{
        code: string;
        quantity: number;
        messages?: string[];
      }>;
      emailReceipt: boolean;
      includeReceipt?: boolean;
      omitIncludeReceiptParam?: boolean;
    }) {
      const args: Record<string, unknown> = {
        p_customer_name: `${SIG} ${input.suffix}`,
        p_phone: PHONE,
        p_email: input.emailReceipt ? EMAIL : null,
        p_pickup_date: PICKUP_DATE,
        p_pickup_time: PICKUP_TIME,
        p_notes: `${SIG} disposable`,
        p_items: items,
        p_email_submission_receipt_requested: input.emailReceipt,
        p_complimentary: input.complimentary,
        p_paid_addons: input.paidAddons,
      };
      if (!input.omitIncludeReceiptParam) {
        args.p_include_receipt = Boolean(input.includeReceipt);
      }
      const { data, error } = await admin.rpc("submit_guest_preorder", args);
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
          "id, guest_name, guest_phone, guest_email, pickup_date, pickup_time, status, fulfilment_method, include_receipt, email_submission_receipt_requested, customer_id",
        )
        .eq("id", orderId)
        .maybeSingle();
      if (error || !order) throw new Error(error?.message ?? "order missing");
      const { data: orderItems } = await admin
        .from("order_items")
        .select("cake_name, size_label, quantity, unit_price")
        .eq("order_id", orderId);
      const { data: addons } = await admin
        .from("order_paid_addons")
        .select(
          "id, code, name, unit_price, financial_shorthand, quantity, written_message, order_paid_addon_messages ( card_index, written_message )",
        )
        .eq("order_id", orderId);
      const { data: comps } = await admin
        .from("order_complimentary_items")
        .select("name, quantity")
        .eq("order_id", orderId);
      return {
        order,
        orderItems: orderItems ?? [],
        addons: addons ?? [],
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
      const paidAddons = loaded.addons.map((row, index) => {
        const child = [
          ...((row.order_paid_addon_messages as Array<{
            card_index: number;
            written_message: string | null;
          }> | null) ?? []),
        ].sort((a, b) => a.card_index - b.card_index);
        return {
          id: String(row.id ?? index),
          orderId: loaded.order.id as string,
          paidAddonTypeId: null,
          code: String(row.code),
          name: String(row.name),
          unitPrice: Number(row.unit_price),
          financialShorthand: String(row.financial_shorthand),
          quantity: Number(row.quantity),
          writtenMessage: row.written_message as string | null,
          messages:
            child.length > 0
              ? child.map((m) => ({
                  cardIndex: Number(m.card_index),
                  writtenMessage: m.written_message,
                }))
              : [
                  {
                    cardIndex: 1,
                    writtenMessage: (row.written_message as string | null) ?? null,
                  },
                ],
          sortOrder: index,
        };
      });
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
          paidAddons,
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
        collectionId: null,
        orderSource: "customer_website" as const,
        crewOrder: false,
        includeReceipt: Boolean(loaded.order.include_receipt),
        items: mappedItems,
        paidAddons,
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

    const a = await submit({
      suffix: "A-ReceiptYes",
      complimentary: [],
      paidAddons: [],
      emailReceipt: false,
      includeReceipt: true,
    });
    check(a.error == null, "A Receipt=YES submit", a.error ?? undefined);
    const rpcMissingIncludeReceipt = Boolean(
      a.error?.includes("p_include_receipt") ||
        a.error?.includes("Could not find the function"),
    );
    if (rpcMissingIncludeReceipt) {
      fail(
        "RPC missing p_include_receipt",
        "Apply supabase/migrations/20260818140000_guest_preorder_include_receipt.sql in SQL Editor, then re-run this script",
      );
    }
    if (a.id) {
      const loaded = await loadOrder(a.id);
      const conf = confirmationFor(loaded);
      check(conf.includeReceipt === true, "A orders.include_receipt = true");
      check(conf.emailRequested === false, "A email-copy remains false");
      check(conf.customer.includes("*Include RECEIPT"), "A confirmation has *Include RECEIPT");
      check(conf.amountDue === 135, "A cake-only RM135", String(conf.amountDue));
      check(!conf.customer.includes("Birthday Card"), "A no Birthday Card");
      check(!conf.customer.includes("*Complimentary"), "A no complimentary line");
    }

    if (rpcMissingIncludeReceipt) {
      throw new Error(
        "stop remaining include_receipt cases until RPC is applied",
      );
    }

    const b = await submit({
      suffix: "B-ReceiptNo",
      complimentary: [],
      paidAddons: [],
      emailReceipt: false,
      includeReceipt: false,
    });
    check(b.error == null, "B Receipt=NO submit", b.error ?? undefined);
    if (b.id) {
      const loaded = await loadOrder(b.id);
      const conf = confirmationFor(loaded);
      check(conf.includeReceipt === false, "B orders.include_receipt = false");
      check(conf.emailRequested === false, "B email-copy remains false");
      check(!conf.customer.includes("*Include RECEIPT"), "B confirmation has no *Include RECEIPT");
      check(conf.amountDue === 135, "B cake-only RM135", String(conf.amountDue));
    }

    const c = await submit({
      suffix: "C-EmailYes-ReceiptNo",
      complimentary: [],
      paidAddons: [],
      emailReceipt: true,
      includeReceipt: false,
    });
    check(c.error == null, "C Email=YES Receipt=NO submit", c.error ?? undefined);
    if (c.id) {
      const loaded = await loadOrder(c.id);
      const conf = confirmationFor(loaded);
      check(conf.emailRequested === true, "C email-copy remains true");
      check(conf.includeReceipt === false, "C physical receipt remains false");
      check(!conf.customer.includes("*Include RECEIPT"), "C confirmation has no *Include RECEIPT");
      check(String(loaded.order.guest_email) === EMAIL, "C guest_email persisted");
    }

    const d = await submit({
      suffix: "D-EmailNo-ReceiptYes",
      complimentary: [],
      paidAddons: [],
      emailReceipt: false,
      includeReceipt: true,
    });
    check(d.error == null, "D Email=NO Receipt=YES submit", d.error ?? undefined);
    if (d.id) {
      const loaded = await loadOrder(d.id);
      const conf = confirmationFor(loaded);
      check(conf.emailRequested === false, "D email-copy remains false");
      check(conf.includeReceipt === true, "D physical receipt is true");
      check(conf.customer.includes("*Include RECEIPT"), "D confirmation has *Include RECEIPT");
      check(loaded.order.guest_email == null, "D guest_email stays null");
    }

    const birthday = await submit({
      suffix: "BirthdayCard",
      complimentary: [],
      paidAddons: [
        {
          code: "birthday_card",
          quantity: 1,
          messages: ["Happy birthday from WB-RCPT."],
        },
      ],
      emailReceipt: false,
      includeReceipt: false,
    });
    check(birthday.error == null, "Birthday Card + Receipt=NO submit", birthday.error ?? undefined);
    if (birthday.id) {
      const loaded = await loadOrder(birthday.id);
      const conf = confirmationFor(loaded);
      check(conf.amountDue === 138, "Birthday Card total RM138", String(conf.amountDue));
      check(
        loaded.addons.some((row) => row.code === "birthday_card" && Number(row.unit_price) === 3),
        "Birthday Card persists at RM3",
      );
      check(
        JSON.stringify(loaded.addons).includes("Happy birthday from WB-RCPT."),
        "Birthday Card message persists",
      );
      check(conf.customer.includes("~ Birthday Card x1"), "Birthday Card confirmation line");
      check(conf.customer.includes("RM3(BC)"), "Birthday Card RM3(BC)");
      check(!conf.customer.includes("*Include RECEIPT"), "Birthday Card has no *Include RECEIPT");
    }

    const wishing = await submit({
      suffix: "WishingCard",
      complimentary: [],
      paidAddons: [
        {
          code: "wishing_card",
          quantity: 1,
          messages: ["Wishing you a wonderful year from WB-RCPT."],
        },
      ],
      emailReceipt: false,
      includeReceipt: true,
    });
    check(wishing.error == null, "Wishing Card + Receipt=YES submit", wishing.error ?? undefined);
    if (wishing.id) {
      const loaded = await loadOrder(wishing.id);
      const conf = confirmationFor(loaded);
      check(conf.amountDue === 138, "Wishing Card total RM138", String(conf.amountDue));
      check(
        loaded.addons.some((row) => row.code === "wishing_card" && Number(row.unit_price) === 3),
        "Wishing Card persists at RM3",
      );
      check(
        JSON.stringify(loaded.addons).includes("Wishing you a wonderful year from WB-RCPT."),
        "Wishing Card message persists",
      );
      check(conf.customer.includes("~ Wishing Card x1"), "Wishing Card confirmation line");
      check(conf.customer.includes("RM3(WC)"), "Wishing Card RM3(WC)");
      check(conf.customer.includes("*Include RECEIPT"), "Wishing Card has *Include RECEIPT");
    }

    const both = await submit({
      suffix: "BothCards",
      complimentary: complimentary.map((row) => ({
        type_id: row.typeId,
        code: row.code,
        quantity: 1,
      })),
      paidAddons: [
        {
          code: "birthday_card",
          quantity: 1,
          messages: ["Birthday both-card WB-RCPT."],
        },
        {
          code: "wishing_card",
          quantity: 1,
          messages: ["Wishing both-card WB-RCPT."],
        },
      ],
      emailReceipt: false,
      includeReceipt: true,
    });
    check(both.error == null, "both cards + complimentary + Receipt=YES", both.error ?? undefined);
    if (both.id) {
      const loaded = await loadOrder(both.id);
      const conf = confirmationFor(loaded);
      check(conf.amountDue === 141, "both cards total RM141", String(conf.amountDue));
      check(
        loaded.addons.filter((row) =>
          ["birthday_card", "wishing_card"].includes(String(row.code)),
        ).length === 2,
        "both cards persist",
      );
      const blob = JSON.stringify(loaded.addons);
      check(blob.includes("Birthday both-card WB-RCPT."), "birthday message persists");
      check(blob.includes("Wishing both-card WB-RCPT."), "wishing message persists");
      check(conf.customer.includes("~ Birthday Card x1"), "confirmation Birthday Card x1");
      check(conf.customer.includes("~ Wishing Card x1"), "confirmation Wishing Card x1");
      check(
        conf.customer.includes("RM135+RM3(BC)+RM3(WC)= RM141"),
        "confirmation RM3+RM3 pricing",
      );
      check(
        conf.customer.includes(
          "*Complimentary Birthday Topper x1, Candle x1, Knife x1",
        ),
        "complimentary confirmation line",
      );
      check(
        conf.customer.includes(
          "*Complimentary Birthday Topper x1, Candle x1, Knife x1\n*Include RECEIPT",
        ),
        "receipt line follows complimentary",
      );
      check(conf.includeReceipt === true, "both-cards include_receipt true");
      check(conf.emailRequested === false, "both-cards email-copy stays false");
    }

    const omitted = await submit({
      suffix: "OmitParam",
      complimentary: [],
      paidAddons: [],
      emailReceipt: false,
      omitIncludeReceiptParam: true,
    });
    check(
      omitted.error == null,
      "compat omit p_include_receipt still submits",
      omitted.error ?? undefined,
    );
    if (omitted.id) {
      const loaded = await loadOrder(omitted.id);
      const conf = confirmationFor(loaded);
      check(conf.includeReceipt === false, "omitted param defaults include_receipt false");
      check(!conf.customer.includes("*Include RECEIPT"), "omitted param has no *Include RECEIPT");
    }

    check(
      orderIds.every((id) => id !== PRODUCT_ORDER_ID),
      "did not touch Product order",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("stop remaining include_receipt cases")) {
      fail("live suite", message);
    }
  } finally {
    for (const id of orderIds) {
      await cleanupOrder(id);
    }
    const leftovers = await leftoverScan();
    check(
      leftovers.length === 0,
      "zero leftover SIG/phone rows",
      leftovers.length === 0
        ? undefined
        : leftovers.map((row) => `${row.id}:${row.guest_name}`).join(", "),
    );
  }

  const failed = checks.filter((row) => !row.ok);
  if (failed.length > 0) {
    console.error(`FAIL guest preorder include-receipt live (${failed.length})`);
    process.exit(1);
  }
  console.log("PASS guest preorder include-receipt live");
}

void main();
