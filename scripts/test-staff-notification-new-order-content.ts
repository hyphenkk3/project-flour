/**
 * new_order notification content: toast, email, payload, and live emit timing.
 * Run: npx tsx scripts/test-staff-notification-new-order-content.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { earliestPickupDateYmd, getPickupSlotsForDate } from "@/engines/business-calendar/pickup-slots";
import { addBusinessCalendarDays } from "@/lib/dates";
import { buildStaffNotificationEmail } from "@/foundation/staff/staff-notification-email";
import {
  buildNewOrderToastDescription,
  compactNewOrderCakeSummary,
  formatNewOrderCakeDisplay,
  formatNewOrderItemLine,
  fulfilmentLabelForMethod,
  parseNewOrderNotificationPayload,
  type NewOrderNotificationSummary,
} from "@/foundation/staff/staff-notification-new-order";
import { classifyTimelineInsert } from "@/foundation/staff/notification-event-identity";

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const avocado: NewOrderNotificationSummary["items"][number] = {
  cakeName: 'Avocado 6"',
  sizeLabel: '6"',
  quantity: 1,
  unitPrice: 135,
  lineTotal: 135,
};
const avocadoBare: NewOrderNotificationSummary["items"][number] = {
  cakeName: "Avocado",
  sizeLabel: '6"',
  quantity: 1,
  unitPrice: 135,
  lineTotal: 135,
};
const yam: NewOrderNotificationSummary["items"][number] = {
  cakeName: "Signature Yam",
  sizeLabel: '6"',
  quantity: 2,
  unitPrice: 125,
  lineTotal: 250,
};

const pickupOne: NewOrderNotificationSummary = {
  guestName: "Aisha",
  guestPhone: "01900001111",
  orderNumber: "ORD-20260906-0001",
  pickupDate: "2026-09-06",
  pickupTime: "13:00",
  fulfilmentMethod: "pickup",
  fulfilmentLabel: "Pickup",
  notes: "Please write Happy Birthday",
  items: [avocado],
  addons: [],
  total: 135,
  delivery: null,
  dineIn: null,
};

const pickupManyNoNotes: NewOrderNotificationSummary = {
  ...pickupOne,
  notes: null,
  items: [avocado, yam],
  total: 385,
};

const dineIn: NewOrderNotificationSummary = {
  ...pickupOne,
  fulfilmentMethod: "dine_in",
  fulfilmentLabel: "Dine-in",
  notes: null,
  dineIn: { venue: "whitebird", guestCount: 4, reservationTime: "15:00" },
};

const delivery: NewOrderNotificationSummary = {
  ...pickupOne,
  fulfilmentMethod: "delivery",
  fulfilmentLabel: "Delivery",
  notes: null,
  delivery: {
    recipientName: "Aisha",
    recipientPhone: "01900001111",
    addressLine1: "1 Jalan Test",
    addressLine2: null,
    postcode: "88000",
    city: "Kota Kinabalu",
    state: "Sabah",
  },
};

assert.equal(fulfilmentLabelForMethod("pickup"), "Pickup");
assert.equal(fulfilmentLabelForMethod("dine_in"), "Dine-in");
assert.equal(fulfilmentLabelForMethod("delivery"), "Delivery");

assert.equal(formatNewOrderCakeDisplay('Avocado 6"', '6"'), 'Avocado 6"');
assert.equal(formatNewOrderCakeDisplay("Avocado", '6"'), 'Avocado · 6"');
assert.equal(
  formatNewOrderCakeDisplay(
    'Dubai Chocolate Kunafa 6" (Slightly Sweeter)',
    '6"',
  ),
  'Dubai Chocolate Kunafa 6" (Slightly Sweeter)',
);

assert.equal(compactNewOrderCakeSummary([avocado]), 'Avocado 6" × 1');
assert.equal(
  compactNewOrderCakeSummary([avocado, yam]),
  'Avocado 6" × 1 + 1 more',
);
assert.equal(compactNewOrderCakeSummary([avocadoBare]), 'Avocado · 6" × 1');
assert.equal(
  formatNewOrderItemLine(avocado),
  'Avocado 6" × 1 — RM135',
);
assert.equal(
  formatNewOrderItemLine(avocadoBare),
  'Avocado · 6" × 1 — RM135',
);
assert.equal(
  formatNewOrderItemLine(yam),
  'Signature Yam · 6" × 2 — RM250',
);

assert.equal(
  buildNewOrderToastDescription(pickupOne),
  'Aisha · Avocado 6" × 1 · 2026-09-06 · Pickup\nORD-20260906-0001',
);
assert.equal(
  buildNewOrderToastDescription(pickupManyNoNotes),
  'Aisha · Avocado 6" × 1 + 1 more · 2026-09-06 · Pickup\nORD-20260906-0001',
);
assert.match(buildNewOrderToastDescription(dineIn), /Dine-in/);
assert.match(buildNewOrderToastDescription(delivery), /Delivery/);

const pickupEmail = buildStaffNotificationEmail({
  code: "new_order",
  title: "New order received",
  description: "unused",
  href: "/owner/orders/order-1",
  newOrder: pickupOne,
});
assert.equal(pickupEmail.subject, "New order received — ORD-20260906-0001");
assert.match(pickupEmail.html, /<h2>New order received<\/h2>/);
assert.match(pickupEmail.html, /<strong>Order:<\/strong> ORD-20260906-0001/);
assert.match(pickupEmail.html, /<strong>Customer:<\/strong> Aisha/);
assert.match(pickupEmail.html, /<strong>WhatsApp:<\/strong> 01900001111/);
assert.match(pickupEmail.html, /<strong>Collection:<\/strong>/);
assert.match(pickupEmail.html, /<strong>Collection time:<\/strong> 1:00 PM/);
assert.match(pickupEmail.html, /<strong>Fulfilment:<\/strong> Pickup/);
assert.match(pickupEmail.html, /Avocado 6&quot; × 1 — RM135/);
assert.doesNotMatch(pickupEmail.html, /Avocado 6&quot; 6&quot;/);
assert.match(pickupEmail.html, /<strong>Total:<\/strong> RM135/);
assert.match(pickupEmail.html, /<strong>Notes:<\/strong>/);
assert.match(pickupEmail.html, /Please write Happy Birthday/);
assert.match(pickupEmail.html, /View in Whitebird →/);

const noNotesEmail = buildStaffNotificationEmail({
  code: "new_order",
  title: "New order received",
  description: "",
  href: "/owner/orders/order-1",
  newOrder: pickupManyNoNotes,
});
assert.doesNotMatch(noNotesEmail.html, /<strong>Notes:<\/strong>/);
assert.match(noNotesEmail.html, /Signature Yam · 6&quot; × 2 — RM250/);
assert.match(noNotesEmail.html, /<strong>Total:<\/strong> RM385/);

const dineEmail = buildStaffNotificationEmail({
  code: "new_order",
  title: "New order received",
  description: "",
  newOrder: dineIn,
});
assert.match(dineEmail.html, /<strong>Fulfilment:<\/strong> Dine-in/);
assert.match(dineEmail.html, /<strong>Venue:<\/strong> Whitebird/);

const deliveryEmail = buildStaffNotificationEmail({
  code: "new_order",
  title: "New order received",
  description: "",
  newOrder: delivery,
});
assert.match(deliveryEmail.html, /<strong>Fulfilment:<\/strong> Delivery/);
assert.match(deliveryEmail.html, /<strong>Address:<\/strong>/);
assert.match(deliveryEmail.html, /1 Jalan Test/);
assert.match(deliveryEmail.html, /Kota Kinabalu/);

const paidEmail = buildStaffNotificationEmail({
  code: "order_paid",
  title: "Order paid",
  description: "Guest · cake",
  orderNumber: "ORD-1",
  customerName: "Guest",
});
assert.match(paidEmail.html, /<h2>Order paid<\/h2>/);
assert.doesNotMatch(paidEmail.html, /<strong>WhatsApp:<\/strong>/);

const edited = classifyTimelineInsert({
  id: "timeline-1",
  orderId: "order-1",
  eventType: "order_updated",
});
assert.equal(edited[0]?.code, "order_edited");
assert.doesNotMatch(edited[0]?.eventKey ?? "", /^new_order:/);

const parsed = parseNewOrderNotificationPayload({
  guestName: "Aisha",
  guestPhone: "01900001111",
  orderNumber: "ORD-20260906-0001",
  pickupDate: "2026-09-06",
  pickupTime: "13:00",
  fulfilmentMethod: "pickup",
  fulfilmentLabel: "Pickup",
  notes: "Please write Happy Birthday",
  items: [avocado],
  addons: [],
  total: 135,
  delivery: null,
  dineIn: null,
});
assert.deepEqual(parsed, pickupOne);

const sql = read(
  "supabase/migrations/20260905010000_staff_notification_new_order_content.sql",
);
assert.match(sql, /_staff_notification_cake_display/);
assert.match(sql, /deferrable initially deferred/i);
assert.doesNotMatch(
  sql.split("if tg_op = 'INSERT'")[1]?.split("if tg_op = 'UPDATE'")[0] ?? "",
  /'new_order:'/,
);
assert.match(sql, /extra_stock_id is not null/);
assert.doesNotMatch(sql, /waiting_list/);
assert.doesNotMatch(sql, /create or replace function public\.staff_notification_on_timeline/);

console.log("PASS staff notification new-order content (static)");

loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.log("SKIP live new-order content (missing Supabase env)");
  process.exit(0);
}

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cleanupIds: string[] = [];
let failed = 0;

function check(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  PASS ${label}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
}

async function cleanupOrder(orderId: string) {
  const { data: events } = await admin
    .from("staff_notification_events")
    .select("id")
    .eq("order_id", orderId);
  const eventIds = (events ?? []).map((row) => row.id);
  if (eventIds.length > 0) {
    await admin
      .from("staff_notification_email_deliveries")
      .delete()
      .in("event_id", eventIds);
  }
  await admin.from("staff_notification_events").delete().eq("order_id", orderId);
  await admin.from("order_complimentary_items").delete().eq("order_id", orderId);
  await admin.from("order_paid_addons").delete().eq("order_id", orderId);
  await admin.from("order_timeline_events").delete().eq("order_id", orderId);
  await admin.from("order_items").delete().eq("order_id", orderId);
  await admin.from("payment_allocations").delete().eq("order_id", orderId);
  await admin.from("refunds").delete().eq("order_id", orderId);
  await admin.from("order_adjustments").delete().eq("order_id", orderId);
  // Fulfilment child rows cascade from orders. Deleting them first
  // trips the deferred delivery/dine-in invariants.
  await admin.from("orders").delete().eq("id", orderId).is("customer_id", null);
}

function nextValidPublicPickup(): { date: string; time: string } {
  let ymd = earliestPickupDateYmd();
  for (let i = 0; i < 21; i++) {
    const preferred =
      getPickupSlotsForDate(ymd).find((slot) => slot.value === "15:00") ??
      getPickupSlotsForDate(ymd)[0];
    if (preferred) return { date: ymd, time: preferred.value };
    ymd = addBusinessCalendarDays(ymd, 1) ?? ymd;
  }
  throw new Error("No public pickup slot in the next 21 days");
}

async function offeredItems(count: number) {
  const { data: collection } = await admin.rpc("storefront_current_collection");
  const collectionId = collection?.id as string | undefined;
  const { data: offeredRows } = await admin
    .from("collection_cakes")
    .select(
      `
      library_cake_id,
      library_cakes (
        id,
        status,
        library_cake_sizes ( id, cake_id )
      )
    `,
    )
    .eq("collection_id", collectionId ?? "")
    .eq("available", true);

  type SizeEmbed = { id: string; cake_id: string };
  type CakeEmbed = {
    id: string;
    status: string;
    library_cake_sizes: SizeEmbed[] | null;
  };
  const cakes = (offeredRows ?? [])
    .map((row) => {
      const cakes = row.library_cakes as CakeEmbed | CakeEmbed[] | null;
      return Array.isArray(cakes) ? cakes[0] : cakes;
    })
    .filter(
      (cake): cake is CakeEmbed =>
        Boolean(cake) &&
        (cake.status === "active" || cake.status === "seasonal") &&
        (cake.library_cake_sizes ?? []).length > 0,
    );

  const items: Array<{ cake_id: string; cake_size_id: string; quantity: number }> =
    [];
  for (const cake of cakes) {
    const size = cake.library_cake_sizes?.[0];
    if (!size) continue;
    items.push({ cake_id: cake.id, cake_size_id: size.id, quantity: 1 });
    if (items.length >= count) break;
  }
  return items;
}

async function submitAndLoad(args: Record<string, unknown>) {
  const { data, error } = await admin.rpc("submit_guest_preorder", args);
  if (data?.id) cleanupIds.push(data.id);
  if (error) return { error: error.message, orderId: null as string | null };
  const orderId = data.id as string;
  const { data: events } = await admin
    .from("staff_notification_events")
    .select("id, event_key, code, description, payload, href")
    .eq("order_id", orderId)
    .eq("code", "new_order");
  return { error: null as string | null, orderId, events: events ?? [] };
}

async function runLive() {
  const pickup = nextValidPublicPickup();
  const one = await offeredItems(1);
  const two = await offeredItems(2);
  check(one.length === 1, "live catalogue has one offerable cake");
  check(two.length >= 2, "live catalogue has two offerable cakes", `got ${two.length}`);

  const single = await submitAndLoad({
    p_customer_name: "WB-NOTIF-CONTENT-SINGLE",
    p_phone: "01900002201",
    p_email: null,
    p_pickup_date: pickup.date,
    p_pickup_time: pickup.time,
    p_notes: "single cake notes",
    p_items: one,
    p_include_receipt: false,
    p_fulfilment_method: "pickup",
  });
  check(single.error == null, "single cake pickup submit", single.error ?? undefined);
  check(single.events.length === 1, "single cake exactly one new_order event");
  const singlePayload = parseNewOrderNotificationPayload(
    (single.events[0]?.payload ?? null) as Record<string, unknown> | null,
  );
  check(singlePayload?.items.length === 1, "single cake payload has one item");
  check(singlePayload?.notes === "single cake notes", "single cake notes present");
  check(singlePayload?.fulfilmentLabel === "Pickup", "single cake fulfilment Pickup");
  check(
    single.events[0]?.description ===
      buildNewOrderToastDescription(singlePayload as NewOrderNotificationSummary),
    "single cake toast description matches payload formatter",
  );

  if (two.length >= 2) {
    const multi = await submitAndLoad({
      p_customer_name: "WB-NOTIF-CONTENT-MULTI",
      p_phone: "01900002202",
      p_email: null,
      p_pickup_date: pickup.date,
      p_pickup_time: pickup.time,
      p_notes: null,
      p_items: two,
      p_include_receipt: false,
      p_fulfilment_method: "pickup",
    });
    check(multi.error == null, "multi cake pickup submit", multi.error ?? undefined);
    check(multi.events.length === 1, "multi cake exactly one new_order event");
    const multiPayload = parseNewOrderNotificationPayload(
      (multi.events[0]?.payload ?? null) as Record<string, unknown> | null,
    );
    check((multiPayload?.items.length ?? 0) >= 2, "multi cake payload has 2+ items");
    check(!multiPayload?.notes, "multi cake has no notes");
    check(
      Boolean(compactNewOrderCakeSummary(multiPayload?.items ?? [])?.includes("more")),
      "multi cake toast uses compact +N more",
    );
  }

  const dine = await submitAndLoad({
    p_customer_name: "WB-NOTIF-CONTENT-DINE",
    p_phone: "01900002203",
    p_email: null,
    p_pickup_date: pickup.date,
    p_pickup_time: pickup.time,
    p_notes: null,
    p_items: one,
    p_include_receipt: false,
    p_fulfilment_method: "dine_in",
    p_dine_in: {
      venue: "whitebird",
      guest_count: 2,
      reservation_time: pickup.time,
    },
  });
  check(dine.error == null, "dine-in submit", dine.error ?? undefined);
  check(dine.events.length === 1, "dine-in exactly one new_order event");
  const dinePayload = parseNewOrderNotificationPayload(
    (dine.events[0]?.payload ?? null) as Record<string, unknown> | null,
  );
  check(dinePayload?.fulfilmentLabel === "Dine-in", "dine-in fulfilment label");
  check(dinePayload?.dineIn?.venue === "whitebird", "dine-in venue in payload");

  const delivered = await submitAndLoad({
    p_customer_name: "WB-NOTIF-CONTENT-DELIV",
    p_phone: "01900002204",
    p_email: null,
    p_pickup_date: pickup.date,
    p_pickup_time: pickup.time,
    p_notes: null,
    p_items: one,
    p_include_receipt: false,
    p_fulfilment_method: "delivery",
    p_delivery: {
      recipient_name: "WB-NOTIF-CONTENT-DELIV",
      recipient_phone: "01900002204",
      address_line_1: "1 Jalan Notif Test",
      address_line_2: null,
      postcode: "88000",
      city: "Kota Kinabalu",
      state: "Sabah",
      recipient_notify_preference: "inform_recipient",
    },
  });
  check(delivered.error == null, "delivery submit", delivered.error ?? undefined);
  check(delivered.events.length === 1, "delivery exactly one new_order event");
  const deliveryPayload = parseNewOrderNotificationPayload(
    (delivered.events[0]?.payload ?? null) as Record<string, unknown> | null,
  );
  check(deliveryPayload?.fulfilmentLabel === "Delivery", "delivery fulfilment label");
  check(
    deliveryPayload?.delivery?.addressLine1 === "1 Jalan Notif Test",
    "delivery address in payload",
  );

  if (single.orderId) {
    const { data: allCodes } = await admin
      .from("staff_notification_events")
      .select("code")
      .eq("order_id", single.orderId);
    const codes = (allCodes ?? []).map((row) => row.code);
    check(
      codes.filter((code) => code === "new_order").length === 1,
      "no duplicate new_order for single cake",
    );
    check(!codes.includes("order_edited"), "submit is not order_edited");
  }
}

async function main() {
  try {
    await runLive();
  } finally {
    for (const id of cleanupIds) {
      await cleanupOrder(id);
    }
  }

  if (failed > 0) {
    console.error(`FAIL staff notification new-order content live (${failed})`);
    process.exit(1);
  }
  console.log("PASS staff notification new-order content (live)");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
