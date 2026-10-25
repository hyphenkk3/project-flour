import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  customerComplimentaryMutationPayload,
  customerComplimentaryDisplayQuantity,
  type CustomerComplimentaryOption,
} from "@/engines/orders/customer-preorder-options";
import {
  buildConfirmationPayload,
  generateConfirmationMessage,
} from "@/engines/orders/confirmation-message";
import { withOperationalMarker } from "@/engines/orders/operational-state";
import {
  isBakeryOrderReadyForCollection,
  isBakeryReadinessReadyForCollection,
} from "@/workspaces/bakery/eligibility";
import { getBakeryFreshPickReadinessForOrders } from "@/workspaces/bakery/queries";
import type { BakeryBoardOrder } from "@/workspaces/bakery/types";
import { collectionCustomerMessageAvailability } from "@/workspaces/collection/ready-message";

const options: CustomerComplimentaryOption[] = [
  {
    typeId: "topper",
    code: "birthday_topper",
    name: "Birthday Topper",
    sortOrder: 0,
  },
  { typeId: "candle", code: "candle", name: "Candle", sortOrder: 1 },
  { typeId: "knife", code: "knife", name: "Knife", sortOrder: 2 },
];

function payload(selectedCodes: string[], eligibleWholeCakeQuantity: number) {
  return customerComplimentaryMutationPayload({
    options,
    selectedCodes,
    eligibleWholeCakeQuantity,
  });
}

assert.equal(
  payload(["candle"], 1)[0]?.quantity,
  1,
  "one cake: selected candle ×1",
);
assert.equal(
  payload(["candle"], 2)[0]?.quantity,
  2,
  "two cakes: selected candle ×2",
);
assert.deepEqual(
  payload([], 2),
  [],
  "unselected complimentary options remain absent",
);
assert.deepEqual(
  payload(["candle"], 2).map((item) => [item.code, item.quantity]),
  [["candle", 2]],
  "selection is per order and omitted knife is not added",
);
assert.deepEqual(
  payload(["birthday_topper", "candle", "knife"], 2).map(
    (item) => item.quantity,
  ),
  [2, 2, 2],
  "all selected items scale by eligible whole cakes",
);
assert.equal(
  payload(["candle"], 3)[0]?.quantity,
  3,
  "multiple lines/line quantities are summed by caller",
);
for (const quantity of [1, 2, 3]) {
  assert.equal(
    customerComplimentaryDisplayQuantity(quantity),
    quantity,
    `Fresh Pick confirmation quantity follows ${quantity} eligible physical cakes`,
  );
}
assert.equal(customerComplimentaryDisplayQuantity(0), 0);
const confirmPromptSource = readFileSync(
  resolve(process.cwd(), "src/workspaces/storefront/checkout/CheckoutConfirmPrompt.tsx"),
  "utf8",
);
const extraFormSource = readFileSync(
  resolve(process.cwd(), "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx"),
  "utf8",
);
assert.match(confirmPromptSource, /customerComplimentaryDisplayQuantity/);
assert.match(confirmPromptSource, /quantity:\s*complimentaryQuantity/);
assert.match(extraFormSource, /eligibleWholeCakeQuantity:\s*cart\?\.items\.length/);
assert.match(confirmPromptSource, /quantity:\s*CUSTOMER_PAID_ADDON_QUANTITY/);
assert.equal(
  payload(["candle"], 0).length,
  0,
  "non-eligible products do not create complimentary cake items",
);
assert.equal(
  payload(["not-a-catalogue-option", "candle"], 2).length,
  1,
  "unknown selections are filtered",
);
const twoCakeConfirmation = generateConfirmationMessage(
  buildConfirmationPayload({
    staffCustomerFacingName: "Whitebird",
    customerName: "Test Guest",
    customerPhone: "0100000000",
    pickupDate: "2026-10-24",
    pickupTime: "15:00",
    items: [
      { cakeName: "Cake A", sizeLabel: '6"', quantity: 1, unitPrice: 100 },
      { cakeName: "Cake B", sizeLabel: '8"', quantity: 1, unitPrice: 150 },
    ],
    complimentaryItems: payload(["candle"], 2).map(({ name, quantity }) => ({
      name,
      quantity,
    })),
    paidAddons: [],
    subtotal: 250,
    adjustments: [],
    amountDue: 250,
    includeReceipt: false,
  }),
);
assert.match(
  twoCakeConfirmation,
  /Candle x1\) × 2 sets/,
  "generated customer confirmation shows two complimentary sets",
);

const checkoutSource = readFileSync(
  resolve(process.cwd(), "src/workspaces/storefront/checkout/actions.ts"),
  "utf8",
);
const extraSource = readFileSync(
  resolve(process.cwd(), "src/workspaces/storefront/extra/actions.ts"),
  "utf8",
);
const waitingListSource = readFileSync(
  resolve(
    process.cwd(),
    "src/workspaces/storefront/waiting-list/confirmation-actions.ts",
  ),
  "utf8",
);
assert.match(
  checkoutSource,
  /items\.reduce\(\(total, item\) => total \+ item\.quantity, 0\)/,
  "whole-cake checkout sums quantities across lines",
);
assert.match(
  extraSource,
  /eligibleWholeCakeQuantity: extraStockIds\.length/,
  "Fresh Pick order counts selected physical cakes",
);
assert.match(
  waitingListSource,
  /lookup_waiting_list_confirmation_link[\s\S]*?confirmationItems\.reduce\(/,
  "waiting-list complimentary quantity comes from the server-held token snapshot",
);

const readyFreshPick: BakeryBoardOrder = {
  id: "synthetic",
  orderNumber: "TEST",
  guestName: "Test Guest",
  pickupDate: "2026-10-24",
  pickupTime: "15:00:00",
  fulfilmentMethod: "pickup",
  status: "paid",
  customerNotes: null,
  needsBakeryAttention: false,
  bakeryAttentionNote: null,
  productionStartedAt: null,
  productionStartedBy: null,
  readyAt: null,
  pickedUpAt: null,
  outForDeliveryAt: null,
  includeReceipt: false,
  cakeLines: [],
  freshPickAllocation: {
    status: "verified",
    lines: [],
    issues: [],
    totalOrderedQuantity: 1,
    totalAssignedQuantity: 1,
    totalRemainingQuantity: 0,
    fullyCovered: true,
  },
  assignedFreshPickStocks: [
    {
      id: "stock-1",
      cakeName: "Test Cake",
      sizeLabel: '6"',
      lifecycle: "confirmed",
      soldAt: "2026-10-23T00:00:00Z",
      cutIntoSlicesAt: null,
      readyForCollection: true,
      legacyLinkConflict: false,
    },
  ],
  complimentaryItems: [],
  paidAddons: [],
};

assert.equal(
  isBakeryOrderReadyForCollection({
    order: readyFreshPick,
    readyAt: null,
    status: "paid",
    paymentStatus: "paid",
  }),
  true,
  "fully covered ready Fresh Pick qualifies without writing ready_at",
);
const undoneFreshPick: BakeryBoardOrder = {
  ...readyFreshPick,
  assignedFreshPickStocks: readyFreshPick.assignedFreshPickStocks.map(
    (stock) => ({ ...stock, readyForCollection: false }),
  ),
};
assert.equal(
  isBakeryOrderReadyForCollection({
    order: undoneFreshPick,
    readyAt: null,
    status: "paid",
    paymentStatus: "paid",
  }),
  false,
  "Undo Ready removes derived Collection readiness",
);
assert.equal(
  isBakeryOrderReadyForCollection({
    order: readyFreshPick,
    readyAt: null,
    status: "paid",
    paymentStatus: "paid",
  }),
  true,
  "Mark Ready restores derived Collection readiness",
);
assert.equal(
  isBakeryOrderReadyForCollection({
    order: readyFreshPick,
    readyAt: null,
    status: "submitted",
    paymentStatus: "unpaid",
  }),
  true,
  "physically ready stock remains ready for display before payment",
);
const unpaidReadinessInput = {
  order: readyFreshPick,
  readyAt: null,
  status: "submitted",
  paymentStatus: "unpaid",
};
const unpaidReadinessSnapshot = { ...unpaidReadinessInput };
assert.equal(
  isBakeryOrderReadyForCollection(unpaidReadinessInput),
  true,
);
assert.deepEqual(
  unpaidReadinessInput,
  unpaidReadinessSnapshot,
  "readiness calculation never mutates order or payment state",
);
assert.equal(
  isBakeryOrderReadyForCollection({
    order: {
      ...readyFreshPick,
      assignedFreshPickStocks: readyFreshPick.assignedFreshPickStocks.map(
        (stock) => ({ ...stock, readyForCollection: false }),
      ),
    },
    readyAt: null,
    status: "submitted",
    paymentStatus: "unpaid",
  }),
  false,
  "Undo Ready removes physical readiness independently of payment",
);
const mixedOrder: BakeryBoardOrder = {
  ...readyFreshPick,
  freshPickAllocation: {
    ...readyFreshPick.freshPickAllocation,
    totalOrderedQuantity: 2,
    totalRemainingQuantity: 1,
    fullyCovered: false,
  },
};
assert.equal(
  isBakeryOrderReadyForCollection({
    order: mixedOrder,
    readyAt: null,
    status: "paid",
    paymentStatus: "paid",
  }),
  false,
  "mixed order with unfinished Bakery quantity remains unready",
);
assert.equal(
  isBakeryOrderReadyForCollection({
    order: { ...readyFreshPick, fulfilmentMethod: "delivery" },
    readyAt: null,
    status: "paid",
    paymentStatus: "paid",
  }),
  false,
  "Fresh Pick physical readiness does not expand to delivery",
);
assert.equal(
  isBakeryOrderReadyForCollection({
    order: null,
    readyAt: "2026-10-24T00:00:00Z",
    status: "paid",
    paymentStatus: "paid",
  }),
  true,
  "persisted lifecycle readiness remains supported",
);

assert.equal(
  withOperationalMarker("Evon Chong", {
    readyAt: null,
    derivedReadyForCollection: true,
    pickedUpAt: null,
    fulfilmentMethod: "pickup",
  }),
  "● Evon Chong",
  "derived readiness shows Calendar dot",
);
assert.equal(
  withOperationalMarker("Evon Chong", {
    readyAt: null,
    derivedReadyForCollection: true,
    pickedUpAt: "2026-10-24T10:00:00Z",
    fulfilmentMethod: "pickup",
  }),
  "✓ Evon Chong",
  "picked-up marker takes precedence over readiness",
);
assert.equal(
  withOperationalMarker("Evon Chong", {
    readyAt: null,
    derivedReadyForCollection: true,
    pickedUpAt: null,
    fulfilmentMethod: "delivery",
  }),
  "Evon Chong",
  "physical Fresh Pick does not imply delivery readiness",
);
const calendarGridSource = readFileSync(
  resolve(process.cwd(), "src/workspaces/owner/calendar/CalendarMonthGrid.tsx"),
  "utf8",
);
const calendarMatrixSource = readFileSync(
  resolve(
    process.cwd(),
    "src/workspaces/owner/calendar/CalendarMatrixView.tsx",
  ),
  "utf8",
);
assert.match(
  calendarGridSource,
  /<span aria-hidden="true">\{marker\} <\/span>[\s\S]*?<span className=\{calendarCustomerSignalClass\(entry\)\}>/,
  "Calendar voucher styling is applied to the name span, separately from the marker",
);
assert.match(
  calendarMatrixSource,
  /<span aria-hidden="true">\{marker\} <\/span>[\s\S]*?customer\.hasEffectiveRm10 \? "line-through"/,
  "Calendar matrix keeps the readiness marker outside voucher strike-through",
);

const messageState = (
  patch: Partial<
    Parameters<typeof collectionCustomerMessageAvailability>[0]
  > = {},
) =>
  collectionCustomerMessageAvailability({
    readyAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    readyMessageSent: false,
    ...patch,
  });
assert.deepEqual(
  messageState({ derivedReadyForCollection: true }),
  {
    activeReady: true,
    showCustomer: true,
    canOpenWhatsApp: true,
    whatsappMessageKind: "ready",
    canMarkReadyMessageSent: true,
  },
  "derived-ready Collection order exposes ready communication",
);
assert.deepEqual(
  messageState({ derivedReadyForCollection: true, pickedUpAt: "picked" }),
  {
    activeReady: false,
    showCustomer: true,
    canOpenWhatsApp: true,
    whatsappMessageKind: "thank_you",
    canMarkReadyMessageSent: false,
  },
  "picked-up order exposes thank-you contact, not ready-sent mutation",
);
assert.equal(
  messageState().showCustomer,
  false,
  "unready order hides customer message controls",
);

console.log(
  "PASS: Fresh Pick Calendar, Collection messaging and complimentary quantity regressions",
);

class QueryMock {
  filters: string[] = [];

  constructor(
    readonly table: string,
    private readonly result: { data: unknown[]; error: null },
    private readonly calls: QueryMock[],
  ) {
    calls.push(this);
  }

  select() { return this; }
  or(filter: string) { this.filters.push(filter); return this; }
  in(column: string, values: string[]) {
    this.filters.push(`${column}.in.(${values.join(",")})`);
    return this;
  }

  then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
    return Promise.resolve(this.result).then(resolve);
  }
}

void (async () => {
  const stockRow = {
    id: "stock-1",
    order_id: "order-1",
    lifecycle: "confirmed",
    sold_at: "2026-10-23T00:00:00Z",
    cut_into_slices_at: null,
    ready_for_collection: true,
    cake_name: "Test Cake",
    size_label: '6"',
    library_cake_id: "cake-1",
    library_cake_size_id: "size-1",
    walk_in_held_until: null,
  };
  const calls: QueryMock[] = [];
  const client = {
    from(table: string) {
      const result = table === "extra_stock"
        ? { data: [stockRow], error: null }
        : { data: [{ id: "order-1", extra_stock_id: "stock-1" }], error: null };
      return new QueryMock(table, result, calls);
    },
  };
  const readiness = await getBakeryFreshPickReadinessForOrders(
    client as never,
    [{
      id: "order-1",
      extra_stock_id: "stock-1",
      order_items: [{
        cakeId: "cake-1",
        cakeName: "Test Cake",
        sizeId: "size-1",
        sizeLabel: '6"',
        quantity: 1,
      }],
    }],
  );
  assert.equal(calls.filter((call) => call.table === "extra_stock").length, 1,
    "allocation and legacy pointer stock sources share one extra_stock request");
  assert.equal(calls.filter((call) => call.table === "orders").length, 1,
    "one pointer-conflict check remains for fail-closed assignment integrity");
  assert.match(calls.find((call) => call.table === "extra_stock")!.filters[0]!,
    /order_id\.in\.\(order-1\),id\.in\.\(stock-1\)/,
    "the merged stock query includes both assignment links");
  const ready = readiness.get("order-1")!;
  assert.equal(ready.allocation.fullyCovered, true);
  assert.equal(isBakeryReadinessReadyForCollection({
    productionStartedAt: null,
    readyAt: null,
    fulfilmentMethod: "pickup",
    freshPickAllocation: ready.allocation,
    assignedFreshPickStocks: ready.assignedStocks.map((stock) => ({
      lifecycle: stock.lifecycle,
      soldAt: stock.soldAt,
      cutIntoSlicesAt: stock.cutIntoSlicesAt,
      readyForCollection: stock.readyForCollection === true,
      legacyLinkConflict: stock.legacyLinkConflict === true,
    })),
    status: "submitted",
    paymentStatus: "unpaid",
  }), true, "reused Calendar order snapshot plus stock data preserves ready result");
  const conflictingCalls: QueryMock[] = [];
  const conflictingClient = {
    from(table: string) {
      const result = table === "extra_stock"
        ? { data: [stockRow], error: null }
        : { data: [{ id: "other-order", extra_stock_id: "stock-1" }], error: null };
      return new QueryMock(table, result, conflictingCalls);
    },
  };
  const conflicting = await getBakeryFreshPickReadinessForOrders(
    conflictingClient as never,
    [{
      id: "order-1",
      extra_stock_id: "stock-1",
      order_items: [{
        cakeId: "cake-1",
        cakeName: "Test Cake",
        sizeId: "size-1",
        sizeLabel: '6"',
        quantity: 1,
      }],
    }],
  );
  const conflictingReadiness = conflicting.get("order-1")!;
  assert.equal(conflictingReadiness.allocation.status, "needs_review",
    "the merged query still detects stock pointers owned by another order");
  assert.equal(isBakeryReadinessReadyForCollection({
    productionStartedAt: null,
    readyAt: null,
    fulfilmentMethod: "pickup",
    freshPickAllocation: conflictingReadiness.allocation,
    assignedFreshPickStocks: conflictingReadiness.assignedStocks.map((stock) => ({
      lifecycle: stock.lifecycle,
      soldAt: stock.soldAt,
      cutIntoSlicesAt: stock.cutIntoSlicesAt,
      readyForCollection: stock.readyForCollection === true,
      legacyLinkConflict: stock.legacyLinkConflict === true,
    })),
    status: "paid",
    paymentStatus: "paid",
  }), false, "conflicting stock linkage fails closed after query consolidation");
  console.log("PASS: Calendar allocation lookup uses two bounded requests and retains pointer validation");
})().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
