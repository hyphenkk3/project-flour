/**
 * Customer Operations Phase 1 — profile order history.
 * Run: npx tsx scripts/test-customer-operations-history.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyCustomerHistorySection,
  customerHistoryOrderHref,
  customerHistoryOrderKindLabel,
  customerHistoryScheduleLabel,
  customerProfilePath,
  dedupeCustomerHistoryOrders,
  guestPhoneFilterKeys,
  guestPhoneMatchesCustomer,
  groupCustomerHistory,
  shouldAttemptGuestPhoneMatch,
  type CustomerHistoryOrder,
} from "@/workspaces/customer-operations/customers/history";
import {
  digitsToFlexiblePhoneRegex,
  GUEST_PHONE_MATCH_MIN_DIGITS,
  malaysiaPhoneEquivalenceKeys,
  normalizePhone,
  phonesMatchForCustomerHistory,
} from "@/workspaces/customer-operations/customers/normalize";
import { matchesCustomerQuery } from "@/workspaces/customer-operations/customers/ui-shared";
import { resolveOwnerReturnTo } from "@/workspaces/owner/navigation/return-to";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function order(
  partial: Partial<CustomerHistoryOrder> &
    Pick<CustomerHistoryOrder, "id" | "orderNumber" | "pickupDate" | "status">,
): CustomerHistoryOrder {
  return {
    customerId: null,
    guestPhone: null,
    pickupTime: "12:00:00",
    paymentStatus: "paid",
    fulfilmentMethod: "pickup",
    orderSource: "customer_website",
    extraStockId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    pickedUpAt: null,
    deliveredAt: null,
    match: "guest_phone",
    ...partial,
  };
}

const CRM_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORDER_A = "11111111-1111-1111-1111-111111111111";
const ORDER_B = "22222222-2222-2222-2222-222222222222";
const ORDER_C = "33333333-3333-3333-3333-333333333333";
const TODAY = "2026-09-14";

// 1. CRM-linked order is included as match: crm
{
  const crm = order({
    id: ORDER_A,
    orderNumber: "WB-CRM",
    pickupDate: "2026-09-20",
    status: "submitted",
    customerId: CRM_ID,
    match: "crm",
  });
  const grouped = groupCustomerHistory([crm], TODAY, false);
  assert.equal(grouped.upcoming.length, 1);
  assert.equal(grouped.upcoming[0]?.match, "crm");
  assert.equal(grouped.summary.totalOrders, 1);
}

// 2. Guest order with matching phone
assert.equal(
  guestPhoneMatchesCustomer("0123456789", "012-345 6789", "0123456789"),
  true,
);

// 3. Differently formatted guest phone (+60 vs local 0, hyphens, spaces)
assert.equal(normalizePhone("+60 12-345 6789"), "60123456789");
assert.equal(
  phonesMatchForCustomerHistory("0123456789", "+60 12-345 6789"),
  true,
);
assert.equal(
  phonesMatchForCustomerHistory("0123456789", "(+60) 12 345 6789"),
  true,
);
assert.equal(
  phonesMatchForCustomerHistory("60123456789", "012-345 6789"),
  true,
);
assert.deepEqual(
  malaysiaPhoneEquivalenceKeys("0123456789").sort(),
  ["0123456789", "60123456789"].sort(),
);

// 4. Unrelated phone does not match
assert.equal(
  phonesMatchForCustomerHistory("0123456789", "0198765432"),
  false,
);
assert.equal(
  guestPhoneMatchesCustomer("0123456789", null, "019-876 5432"),
  false,
);

// 5. No phone / short phone — no guest matching
assert.equal(shouldAttemptGuestPhoneMatch(null, null), false);
assert.equal(shouldAttemptGuestPhoneMatch("1234", "1234"), false);
assert.equal(guestPhoneFilterKeys(null, null).length, 0);
assert.equal(GUEST_PHONE_MATCH_MIN_DIGITS, 8);
assert.equal(phonesMatchForCustomerHistory(null, "0123456789"), false);
assert.equal(phonesMatchForCustomerHistory("0123456789", null), false);
assert.equal(phonesMatchForCustomerHistory("1234", "1234"), false);

// 6. New vs Returning
{
  const one = groupCustomerHistory(
    [
      order({
        id: ORDER_A,
        orderNumber: "WB-1",
        pickupDate: "2026-09-20",
        status: "paid",
      }),
    ],
    TODAY,
    true,
  );
  assert.equal(one.summary.repeatLabel, "New");
  assert.equal(one.summary.totalOrders, 1);

  const two = groupCustomerHistory(
    [
      order({
        id: ORDER_A,
        orderNumber: "WB-1",
        pickupDate: "2026-09-20",
        status: "paid",
      }),
      order({
        id: ORDER_B,
        orderNumber: "WB-2",
        pickupDate: "2026-08-01",
        status: "paid",
        pickedUpAt: "2026-08-01T04:00:00.000Z",
      }),
    ],
    TODAY,
    true,
  );
  assert.equal(two.summary.repeatLabel, "Returning");
  assert.equal(two.summary.totalOrders, 2);

  const none = groupCustomerHistory([], TODAY, true);
  assert.equal(none.summary.repeatLabel, null);
  assert.equal(none.summary.totalOrders, 0);
}

// 7. Upcoming / past / cancelled grouping
{
  const upcoming = order({
    id: ORDER_A,
    orderNumber: "WB-UP",
    pickupDate: "2026-09-20",
    status: "paid",
  });
  const todayOpen = order({
    id: "44444444-4444-4444-4444-444444444444",
    orderNumber: "WB-TODAY",
    pickupDate: TODAY,
    status: "paid",
  });
  const pastByDate = order({
    id: ORDER_B,
    orderNumber: "WB-PAST",
    pickupDate: "2026-09-01",
    status: "paid",
  });
  const pastByPickup = order({
    id: "55555555-5555-5555-5555-555555555555",
    orderNumber: "WB-COLLECTED",
    pickupDate: "2026-09-20",
    status: "paid",
    pickedUpAt: "2026-09-14T02:00:00.000Z",
  });
  const pastCompleted = order({
    id: "66666666-6666-6666-6666-666666666666",
    orderNumber: "WB-DONE",
    pickupDate: "2026-09-22",
    status: "completed",
    customerId: CRM_ID,
    match: "crm",
  });
  const cancelledFuture = order({
    id: ORDER_C,
    orderNumber: "WB-CXL",
    pickupDate: "2026-09-30",
    status: "cancelled",
  });

  assert.equal(classifyCustomerHistorySection(upcoming, TODAY), "upcoming");
  assert.equal(classifyCustomerHistorySection(todayOpen, TODAY), "upcoming");
  assert.equal(classifyCustomerHistorySection(pastByDate, TODAY), "past");
  assert.equal(classifyCustomerHistorySection(pastByPickup, TODAY), "past");
  assert.equal(classifyCustomerHistorySection(pastCompleted, TODAY), "past");
  assert.equal(
    classifyCustomerHistorySection(cancelledFuture, TODAY),
    "cancelled",
  );

  const grouped = groupCustomerHistory(
    [
      upcoming,
      todayOpen,
      pastByDate,
      pastByPickup,
      pastCompleted,
      cancelledFuture,
    ],
    TODAY,
    true,
  );
  assert.equal(grouped.upcoming.length, 2);
  assert.equal(grouped.past.length, 3);
  assert.equal(grouped.cancelled.length, 1);
  assert.equal(grouped.summary.upcomingCount, 2);
  assert.equal(grouped.summary.firstPickupDate, "2026-09-01");
  assert.equal(grouped.summary.lastPickupDate, "2026-09-30");
}

// 8. Duplicate counting avoided when the same order is CRM-linked and phone-matched
{
  const crm = order({
    id: ORDER_A,
    orderNumber: "WB-DUP",
    pickupDate: "2026-09-20",
    status: "submitted",
    customerId: CRM_ID,
    match: "crm",
  });
  const guestTwin = order({
    id: ORDER_A,
    orderNumber: "WB-DUP",
    pickupDate: "2026-09-20",
    status: "submitted",
    match: "guest_phone",
  });
  const unique = dedupeCustomerHistoryOrders([guestTwin, crm]);
  assert.equal(unique.length, 1);
  assert.equal(unique[0]?.match, "crm");

  const grouped = groupCustomerHistory([guestTwin, crm], TODAY, true);
  assert.equal(grouped.summary.totalOrders, 1);
  assert.equal(grouped.summary.repeatLabel, "New");
}

// Kind labels + hrefs
assert.equal(
  customerHistoryOrderKindLabel({ customerId: null, extraStockId: "x" }),
  "Fresh Picks",
);
assert.equal(
  customerHistoryOrderKindLabel({ customerId: null, extraStockId: null }),
  "Whole Cake",
);
assert.equal(
  customerHistoryOrderKindLabel({ customerId: CRM_ID, extraStockId: null }),
  "Staff order",
);

assert.equal(customerHistoryScheduleLabel("pickup"), "Pickup");
assert.equal(customerHistoryScheduleLabel("dine_in"), "Dine-in");
assert.equal(customerHistoryScheduleLabel("delivery"), "Delivery");
assert.equal(customerHistoryScheduleLabel(null), "Pickup");

{
  const panelSrc = readSrc(
    "src/workspaces/customer-operations/customers/CustomerHistoryPanel.tsx",
  );
  assert.match(panelSrc, /customerHistoryScheduleLabel/);
  assert.doesNotMatch(panelSrc, /Pickup · \{formatOrderDate/);
}

assert.equal(
  customerHistoryOrderHref(
    { id: ORDER_A, customerId: CRM_ID },
    CRM_ID,
  ),
  `/customer-operations/orders/${ORDER_A}`,
);
assert.equal(
  customerHistoryOrderHref({ id: ORDER_B, customerId: null }, CRM_ID),
  `/owner/orders/${ORDER_B}?returnTo=${encodeURIComponent(customerProfilePath(CRM_ID))}`,
);

assert.equal(
  digitsToFlexiblePhoneRegex("0123456789"),
  "0\\D*1\\D*2\\D*3\\D*4\\D*5\\D*6\\D*7\\D*8\\D*9",
);
assert.equal(digitsToFlexiblePhoneRegex("12-34"), "");

// Directory search stays consistent with +60 vs 0
assert.equal(
  matchesCustomerQuery(
    {
      fullName: "Amy Tan",
      phoneNumber: "012-345 6789",
      phoneNormalized: "0123456789",
      whatsappUsername: null,
      email: null,
    },
    "+60123456789",
  ),
  true,
);

// 9. Access control remains on the Customer Operations layout
{
  const layout = readSrc("src/app/(app)/customer-operations/layout.tsx");
  assert.match(layout, /requireStaff/);
  assert.match(layout, /canAccessWorkspace\(staff\.role\.code, "customer_operations"\)/);

  const actions = readSrc(
    "src/workspaces/customer-operations/customers/actions.ts",
  );
  assert.match(actions, /requireCustomerOperationsStaff/);

  const queries = readSrc(
    "src/workspaces/customer-operations/customers/history-queries.ts",
  );
  assert.match(queries, /createClient/);
  assert.doesNotMatch(queries, /createServiceClient/);
  assert.match(queries, /\.eq\("customer_id", input\.customerId\)/);
  assert.match(queries, /\.is\("customer_id", null\)/);
  assert.doesNotMatch(queries, /from\("orders"\)[\s\S]*\.select\("\*"\)/);
}

// 10. Storefront / order status / identity writes untouched
{
  const historyQueries = readSrc(
    "src/workspaces/customer-operations/customers/history-queries.ts",
  );
  assert.doesNotMatch(historyQueries, /\.update\(/);
  assert.doesNotMatch(historyQueries, /\.insert\(/);
  assert.doesNotMatch(historyQueries, /\.upsert\(/);
  assert.doesNotMatch(historyQueries, /\.delete\(/);

  const checkout = readSrc("src/workspaces/storefront/checkout/actions.ts");
  assert.doesNotMatch(
    checkout,
    /loadCustomerOrderHistory|customer-operations\/customers\/history/,
  );

  const coOrders = readSrc(
    "src/workspaces/customer-operations/orders/actions.ts",
  );
  assert.match(coOrders, /createOrderAction/);

  const profile = readSrc(
    "src/app/(app)/customer-operations/customers/[id]/page.tsx",
  );
  assert.doesNotMatch(profile, /Coming in V0\.3/);
  assert.match(profile, /CustomerHistoryPanel/);
  assert.doesNotMatch(profile, /Timeline/);
}

// Navigation: guest workspace can return to the originating profile
{
  const profileHref = customerProfilePath(CRM_ID);
  const back = resolveOwnerReturnTo(profileHref);
  assert.equal(back.href, profileHref);
  assert.equal(back.label, "Customer profile");
  assert.equal(resolveOwnerReturnTo("/customer-operations/orders").href, "/customer-operations/orders");
  assert.equal(resolveOwnerReturnTo("/customer-operations/orders").label, "Orders");
  assert.equal(
    resolveOwnerReturnTo("/customer-operations/customers/not-a-uuid").href,
    "/owner",
  );

  const detailSrc = readSrc("src/workspaces/owner/OwnerOrderDetail.tsx");
  assert.match(detailSrc, /Customer profile/);
}

console.log("PASS customer operations profile order history");
