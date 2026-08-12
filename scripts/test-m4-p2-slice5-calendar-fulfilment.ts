/**
 * M4-P2 Slice 5 — Calendar fulfilment presentation (background colour trial).
 * Snapshot/helper suite only (no live DB fixtures).
 *
 * Run: npx tsx scripts/test-m4-p2-slice5-calendar-fulfilment.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildQuickViewFulfilmentSummary,
  defaultDeliveryFinanceDtoFields,
  isPickupCrewMessageAvailable,
} from "@/engines/orders/fulfilment";
import { withOperationalMarker } from "@/engines/orders/operational-state";
import {
  cakeLinesFromCalendarEntries,
  totalCakeQuantityFromCalendarEntries,
} from "@/workspaces/owner/calendar/cake-production";
import {
  CALENDAR_FULFILMENT_DELIVERY_BG_CLASS,
  CALENDAR_FULFILMENT_DELIVERY_LINE_CHROME_CLASS,
  calendarFulfilmentBackgroundClass,
  isCalendarDeliveryFulfilmentPresentation,
} from "@/workspaces/owner/calendar/calendar-fulfilment-presentation";
import {
  calendarCustomerLineClass,
  calendarCustomerSignalClass,
} from "@/workspaces/owner/calendar/CalendarGuide";
import { buildCalendarMatrix } from "@/workspaces/owner/calendar/matrix";
import { normalizeCalendarFulfilmentMethod } from "@/workspaces/owner/calendar/queries";
import type { CalendarEntry } from "@/workspaces/owner/calendar/types";
import { guestOrderStatusTextClass } from "@/workspaces/owner/orders/labels";
import type {
  GuestOrderStatus,
  StorefrontOrder,
  StorefrontOrderFulfilmentMethod,
} from "@/types/storefront";

function entry(
  overrides: Partial<CalendarEntry> = {},
): CalendarEntry {
  return {
    kind: "order",
    id: "order-1",
    pickupDate: "2026-08-15",
    pickupTime: "13:00:00",
    fulfilmentMethod: "pickup",
    customerName: "Amy",
    displayName: "Amy",
    status: "paid",
    needsBakeryAttention: false,
    hasEffectiveRm10: false,
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    items: [
      {
        id: "item-1",
        cakeName: "Chocolate D'Amour",
        sizeLabel: '6"',
        quantity: 1,
      },
    ],
    ...overrides,
  };
}

const cakeItem = {
  id: "item-1",
  cakeName: "Chocolate D'Amour",
  sizeLabel: '6"',
  quantity: 1,
};

// ---------------------------------------------------------------------------
// A–E Presentation mapping + normalization
// ---------------------------------------------------------------------------
{
  assert.equal(calendarFulfilmentBackgroundClass("pickup"), "");
  assert.ok(
    calendarFulfilmentBackgroundClass("delivery").includes(
      CALENDAR_FULFILMENT_DELIVERY_BG_CLASS,
    ),
  );
  assert.ok(
    calendarFulfilmentBackgroundClass("delivery").includes(
      CALENDAR_FULFILMENT_DELIVERY_LINE_CHROME_CLASS,
    ),
  );
  assert.equal(CALENDAR_FULFILMENT_DELIVERY_LINE_CHROME_CLASS, "inline-block rounded-sm px-1 py-0.5");
  assert.equal(calendarFulfilmentBackgroundClass(null), "");
  assert.equal(calendarFulfilmentBackgroundClass(undefined), "");
  assert.equal(calendarFulfilmentBackgroundClass("drive_through"), "");
  assert.equal(calendarFulfilmentBackgroundClass("dine_in"), "");
  assert.equal(calendarFulfilmentBackgroundClass("unknown_future"), "");
  assert.equal(isCalendarDeliveryFulfilmentPresentation("delivery"), true);
  assert.equal(isCalendarDeliveryFulfilmentPresentation("pickup"), false);

  assert.equal(normalizeCalendarFulfilmentMethod("delivery"), "delivery");
  assert.equal(normalizeCalendarFulfilmentMethod("pickup"), "pickup");
  assert.equal(normalizeCalendarFulfilmentMethod(null), "pickup");
  assert.equal(normalizeCalendarFulfilmentMethod(""), "pickup");
  assert.equal(normalizeCalendarFulfilmentMethod("drive_through"), "drive_through");
  assert.equal(normalizeCalendarFulfilmentMethod("weird"), "pickup");
}

// ---------------------------------------------------------------------------
// F Same-date Pickup + Delivery distinguishable
// ---------------------------------------------------------------------------
{
  const pickup = entry({ id: "p1", fulfilmentMethod: "pickup" });
  const delivery = entry({
    id: "d1",
    fulfilmentMethod: "delivery",
    customerName: "Bler",
    displayName: "Bler",
  });
  assert.equal(calendarFulfilmentBackgroundClass(pickup.fulfilmentMethod), "");
  assert.ok(
    calendarFulfilmentBackgroundClass(delivery.fulfilmentMethod).includes(
      CALENDAR_FULFILMENT_DELIVERY_BG_CLASS,
    ),
  );
  assert.notEqual(
    calendarFulfilmentBackgroundClass(pickup.fulfilmentMethod),
    calendarFulfilmentBackgroundClass(delivery.fulfilmentMethod),
  );
}

// ---------------------------------------------------------------------------
// G–K Status text colour independence + coexistence
// ---------------------------------------------------------------------------
{
  const statuses: GuestOrderStatus[] = [
    "submitted",
    "pending_confirmation",
    "awaiting_payment",
    "paid",
  ];
  for (const status of statuses) {
    const delivery = entry({ fulfilmentMethod: "delivery", status });
    const signal = calendarCustomerSignalClass(delivery);
    const line = calendarCustomerLineClass(delivery);
    assert.ok(signal.includes(guestOrderStatusTextClass(status)));
    assert.ok(line.includes(guestOrderStatusTextClass(status)));
    assert.ok(line.includes(CALENDAR_FULFILMENT_DELIVERY_BG_CLASS));
    // Background helper must not emit status text classes
    assert.ok(
      !calendarFulfilmentBackgroundClass("delivery").includes("text-status"),
    );
    assert.ok(
      !calendarFulfilmentBackgroundClass("delivery").includes("text-ink"),
    );
  }
}

// ---------------------------------------------------------------------------
// L–O Bold / RM10 / Ready / Picked Up coexist with Delivery bg
// ---------------------------------------------------------------------------
{
  const attentive = entry({
    fulfilmentMethod: "delivery",
    needsBakeryAttention: true,
    hasEffectiveRm10: true,
    readyAt: "2026-08-14T01:00:00Z",
    pickedUpAt: null,
  });
  const signal = calendarCustomerSignalClass(attentive);
  assert.ok(signal.includes("font-bold"));
  assert.ok(signal.includes("line-through"));
  assert.ok(
    calendarCustomerLineClass(attentive).includes(
      CALENDAR_FULFILMENT_DELIVERY_BG_CLASS,
    ),
  );
  assert.ok(
    withOperationalMarker("Amy", {
      readyAt: attentive.readyAt,
      pickedUpAt: attentive.pickedUpAt,
      outForDeliveryAt: attentive.outForDeliveryAt,
      deliveredAt: attentive.deliveredAt,
      fulfilmentMethod: "delivery",
    }).startsWith("●"),
  );

  const stalePickedUp = entry({
    fulfilmentMethod: "delivery",
    readyAt: "2026-08-14T01:00:00Z",
    pickedUpAt: "2026-08-15T02:00:00Z",
  });
  assert.ok(
    withOperationalMarker("Amy", {
      readyAt: stalePickedUp.readyAt,
      pickedUpAt: stalePickedUp.pickedUpAt,
      outForDeliveryAt: stalePickedUp.outForDeliveryAt,
      deliveredAt: stalePickedUp.deliveredAt,
      fulfilmentMethod: "delivery",
    }).startsWith("●"),
    "Delivery must ignore stale picked_up_at",
  );

  const out = entry({
    fulfilmentMethod: "delivery",
    readyAt: "2026-08-14T01:00:00Z",
    outForDeliveryAt: "2026-08-15T03:00:00Z",
  });
  assert.ok(
    withOperationalMarker("Amy", {
      readyAt: out.readyAt,
      pickedUpAt: out.pickedUpAt,
      outForDeliveryAt: out.outForDeliveryAt,
      deliveredAt: out.deliveredAt,
      fulfilmentMethod: "delivery",
    }).startsWith("○"),
  );

  const delivered = entry({
    fulfilmentMethod: "delivery",
    readyAt: "2026-08-14T01:00:00Z",
    outForDeliveryAt: "2026-08-15T03:00:00Z",
    deliveredAt: "2026-08-15T06:00:00Z",
  });
  assert.ok(
    withOperationalMarker("Amy", {
      readyAt: delivered.readyAt,
      pickedUpAt: delivered.pickedUpAt,
      outForDeliveryAt: delivered.outForDeliveryAt,
      deliveredAt: delivered.deliveredAt,
      fulfilmentMethod: "delivery",
    }).startsWith("✓"),
  );
}

// ---------------------------------------------------------------------------
// P–S Matrix / cake counts — fulfilment is presentation only
// ---------------------------------------------------------------------------
{
  const pickup = entry({
    id: "p-cake",
    fulfilmentMethod: "pickup",
    items: [{ ...cakeItem, id: "i1", quantity: 2 }],
  });
  const delivery = entry({
    id: "d-cake",
    fulfilmentMethod: "delivery",
    customerName: "Dev",
    displayName: "Dev",
    items: [{ ...cakeItem, id: "i2", quantity: 2 }],
  });

  const qtyPickupOnly = totalCakeQuantityFromCalendarEntries([pickup]);
  const qtyDeliveryOnly = totalCakeQuantityFromCalendarEntries([delivery]);
  assert.equal(qtyPickupOnly, qtyDeliveryOnly);
  assert.equal(qtyPickupOnly, 2);

  const mixed = totalCakeQuantityFromCalendarEntries([pickup, delivery]);
  assert.equal(mixed, 4);

  const matrix = buildCalendarMatrix([pickup, delivery], ["2026-08-15"]);
  assert.equal(matrix.length, 1);
  const cell = matrix[0]!.cellsByDate["2026-08-15"]!;
  assert.equal(cell.totalQuantity, 4);
  assert.equal(cell.customers.length, 2);
  assert.equal(
    cell.customers.find((c) => c.orderId === "p-cake")?.fulfilmentMethod,
    "pickup",
  );
  assert.equal(
    cell.customers.find((c) => c.orderId === "d-cake")?.fulfilmentMethod,
    "delivery",
  );

  // Paid BC/WC never on CalendarEntry.items — cake lines ignore them by construction
  const cakeLines = cakeLinesFromCalendarEntries([pickup, delivery]);
  assert.equal(cakeLines.length, 2);
  assert.ok(cakeLines.every((line) => line.cakeName === "Chocolate D'Amour"));
}

// ---------------------------------------------------------------------------
// T Delivery creates no financial line (presentation helper source scan)
// ---------------------------------------------------------------------------
{
  const src = readFileSync(
    resolve("src/workspaces/owner/calendar/calendar-fulfilment-presentation.ts"),
    "utf8",
  );
  assert.ok(!/amountDue|settlement|delivery.?fee|processing.?fee/i.test(src));
}

// ---------------------------------------------------------------------------
// U–V Quick View regression (Slice 4 helpers unchanged)
// ---------------------------------------------------------------------------
{
  const pickupOrder = {
    fulfilmentMethod: "pickup" as const,
    customerName: "Amy",
    phone: "012",
    pickupDate: "2026-08-15",
    pickupTime: "13:00",
    delivery: null,
  } as StorefrontOrder;
  const deliveryOrder = {
    fulfilmentMethod: "delivery" as const,
    customerName: "Amy",
    phone: "012",
    pickupDate: "2026-08-15",
    pickupTime: "13:00",
    delivery: {
      recipientName: "Amy",
      recipientPhone: "012",
      addressLine1: "Jln 1",
      addressLine2: null,
      postcode: "88400",
      city: "Kota Kinabalu",
      state: "Sabah",
      recipientNotifyPreference: "inform_recipient",
      ...defaultDeliveryFinanceDtoFields(),
    },
  } as StorefrontOrder;

  const pickupSummary = buildQuickViewFulfilmentSummary(pickupOrder);
  assert.equal(pickupSummary.methodLabel, "Pickup");
  assert.equal(pickupSummary.isDelivery, false);

  const deliverySummary = buildQuickViewFulfilmentSummary(deliveryOrder);
  assert.equal(deliverySummary.methodLabel, "Delivery");
  assert.equal(deliverySummary.isDelivery, true);
  assert.equal(isPickupCrewMessageAvailable("delivery"), false);
  assert.equal(isPickupCrewMessageAvailable("pickup"), true);
}

// ---------------------------------------------------------------------------
// W Sorting unchanged (time then name)
// ---------------------------------------------------------------------------
{
  const a = entry({
    id: "a",
    pickupTime: "15:00:00",
    customerName: "Zoe",
    displayName: "Zoe",
    fulfilmentMethod: "delivery",
  });
  const b = entry({
    id: "b",
    pickupTime: "13:00:00",
    customerName: "Amy",
    displayName: "Amy",
    fulfilmentMethod: "pickup",
  });
  const matrix = buildCalendarMatrix([a, b], ["2026-08-15"]);
  const customers = matrix[0]!.cellsByDate["2026-08-15"]!.customers;
  assert.equal(customers[0]!.orderId, "b");
  assert.equal(customers[1]!.orderId, "a");
}

// ---------------------------------------------------------------------------
// X Calendar URL builders unchanged (no new params)
// ---------------------------------------------------------------------------
{
  const urlSrc = readFileSync(
    resolve("src/workspaces/owner/calendar/calendar-url.ts"),
    "utf8",
  );
  assert.ok(urlSrc.includes("buildWholeCakeCalendarPath"));
  assert.ok(!/fulfilment|deliveryBg|orderId/.test(urlSrc));
}

// ---------------------------------------------------------------------------
// Y Historical / website Pickup baseline
// ---------------------------------------------------------------------------
{
  const historical = entry({
    fulfilmentMethod: normalizeCalendarFulfilmentMethod(null),
  });
  assert.equal(historical.fulfilmentMethod, "pickup");
  assert.equal(
    calendarFulfilmentBackgroundClass(historical.fulfilmentMethod),
    "",
  );
}

// ---------------------------------------------------------------------------
// Z No Dine-In create/edit path introduced
// ---------------------------------------------------------------------------
{
  const createFields = readFileSync(
    resolve("src/workspaces/owner/orders/OrderFulfilmentCreateFields.tsx"),
    "utf8",
  );
  assert.ok(!/dine.?in|dine_in|🍽️/i.test(createFields));
  const presentation = readFileSync(
    resolve(
      "src/workspaces/owner/calendar/calendar-fulfilment-presentation.ts",
    ),
    "utf8",
  );
  assert.ok(!/dine_in|🍽️/.test(presentation));
}

// ---------------------------------------------------------------------------
// AA–AB Guide + AD no emoji
// ---------------------------------------------------------------------------
{
  const guide = readFileSync(
    resolve("src/workspaces/owner/calendar/CalendarGuide.tsx"),
    "utf8",
  );
  assert.ok(guide.includes("Status colour"));
  assert.ok(guide.includes("Fulfilment background"));
  assert.ok(guide.includes("Delivery"));
  assert.ok(guide.includes("CALENDAR_FULFILMENT_DELIVERY_BG_CLASS"));
  assert.ok(guide.includes("Soft background = fulfilment method"));
  assert.ok(!guide.includes("🚗"));
  assert.ok(!guide.includes("Dine-In"));
  assert.ok(!guide.includes("Dine-in"));

  const matrixSrc = readFileSync(
    resolve("src/workspaces/owner/calendar/CalendarMatrixView.tsx"),
    "utf8",
  );
  const monthSrc = readFileSync(
    resolve("src/workspaces/owner/calendar/CalendarMonthGrid.tsx"),
    "utf8",
  );
  assert.ok(!matrixSrc.includes("🚗"));
  assert.ok(!monthSrc.includes("🚗"));
}

// ---------------------------------------------------------------------------
// AC Today chrome remains status-info (Delivery uses warning-soft pale yellow)
// ---------------------------------------------------------------------------
{
  assert.notEqual(CALENDAR_FULFILMENT_DELIVERY_BG_CLASS, "bg-status-info-soft");
  assert.notEqual(
    CALENDAR_FULFILMENT_DELIVERY_BG_CLASS,
    "bg-status-info-soft/40",
  );
  assert.equal(CALENDAR_FULFILMENT_DELIVERY_BG_CLASS, "bg-status-warning-soft");
  assert.notEqual(CALENDAR_FULFILMENT_DELIVERY_BG_CLASS, "bg-signal-soft");

  const globals = readFileSync(resolve("src/app/globals.css"), "utf8");
  assert.ok(globals.includes("--color-status-warning-soft"));
  assert.ok(globals.includes("#ffefd9"));
  assert.ok(globals.includes("--color-status-info-soft"));
  assert.ok(!globals.includes("--color-signal-soft"));
  assert.ok(!globals.includes("#b8d4cf"));
}

// ---------------------------------------------------------------------------
// Copy refinements
// ---------------------------------------------------------------------------
{
  const page = readFileSync(
    resolve("src/workspaces/owner/calendar/WholeCakeCalendarPage.tsx"),
    "utf8",
  );
  assert.ok(page.includes("Production scan by fulfilment date"));
  assert.ok(!page.includes("Production scan by pickup date"));

  const matrixSrc = readFileSync(
    resolve("src/workspaces/owner/calendar/CalendarMatrixView.tsx"),
    "utf8",
  );
  assert.ok(matrixSrc.includes("No whole-cake orders in this month yet."));
  assert.ok(!matrixSrc.includes("No whole-cake pickups"));
}

// Type exhaustiveness smoke — methods used in mapping
{
  const methods: StorefrontOrderFulfilmentMethod[] = [
    "pickup",
    "delivery",
    "drive_through",
  ];
  for (const method of methods) {
    const bg = calendarFulfilmentBackgroundClass(method);
    if (method === "delivery") {
      assert.ok(bg.includes(CALENDAR_FULFILMENT_DELIVERY_BG_CLASS));
    } else {
      assert.equal(bg, "");
    }
  }
}

console.log("M4-P2 Slice 5 calendar-fulfilment tests: PASSED");
