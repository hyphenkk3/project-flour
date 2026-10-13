import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const cache = new Map();
function pure(name) {
  if (!name.startsWith("@/")) return require(name);
  if (cache.has(name)) return cache.get(name);
  const stem = path.join(process.cwd(), "src", name.slice(2));
  const file = [stem + ".ts", stem + ".tsx", stem + "/index.ts"].find(
    existsSync,
  );
  assert.ok(file, name);
  const exports = {};
  cache.set(name, exports);
  const js = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(
    js,
    {
      exports,
      require: pure,
      Date,
      console,
      Intl,
      Map,
      Set,
      Number,
      String,
      Math,
    },
    { filename: file },
  );
  return exports;
}
const {
  buildMonthlyReport,
  classifyAdjustment,
  isReportOwner,
  orderFinancials,
  percentChange,
  previousMonth,
  reportFulfilled,
  summarizeCash,
} = pure("@/engines/reports/monthly");
const { getNavigationForRole } = pure("@/foundation/navigation/workspaces");
const { isWorkspaceNavActive } = pure("@/foundation/navigation/is-active");
const item = (cakeName, sizeLabel, quantity, unitPrice) => ({
  cakeName,
  sizeLabel,
  quantity,
  unitPrice,
});
const adjustment = (
  amount,
  kind,
  code = null,
  status = "active",
  reversesAdjustmentId = null,
) => ({
  amount,
  kind,
  code,
  label: code ?? "Adjustment",
  reason: null,
  status,
  reversesAdjustmentId,
});
const base = (id, method = "pickup") => ({
  id,
  pickupDate: "2026-10-05",
  createdAt: "2026-09-28T10:00:00Z",
  method,
  status: "paid",
  source: "customer_website",
  extraStockId: null,
  deliveryConcession: 0,
  pickedUpAt: null,
  deliveredAt: null,
  items: [item("Old Mango", '6"', 2, 50), item("Pistachio", '8"', 1, 80)],
  addons: [{ quantity: 1, unitPrice: 3 }],
  adjustments: [],
  allocations: [],
  refunds: [],
});
const pickup = {
  ...base("pickup"),
  pickedUpAt: "2026-10-06T01:00:00Z",
  adjustments: [
    adjustment(-10, "promotion", "august_promo_2026"),
    adjustment(-8, "promotion", "august_promo_2026", "reversed"),
    adjustment(8, "reversal", "august_promo_2026", "active", "old"),
    adjustment(5, "fee", "delivery_fee"),
    adjustment(2, "fee", "delivery_processing_fee"),
    adjustment(-4, "manual"),
  ],
  allocations: [
    {
      amount: 100,
      effectiveAmount: 90,
      status: "verified",
      method: "wb_qr",
      paidAt: "2026-09-29T00:00:00Z",
    },
  ],
  refunds: [
    { amount: 5, status: "recorded", refundedAt: "2026-10-10T00:00:00Z" },
  ],
};
const delivery = {
  ...base("delivery", "delivery"),
  pickedUpAt: "2026-10-07T00:00:00Z",
  deliveredAt: "2026-11-01T00:00:00Z",
  items: [item("Mango", '6"', 1, 50)],
  addons: [],
  extraStockId: "stock",
  deliveryConcession: 10,
  source: "last_minute",
};
const dine = {
  ...base("dine", "dine_in"),
  pickedUpAt: "2026-10-05T11:00:00Z",
  items: [item("Mango", '6"', 1, 50)],
  addons: [],
};
const readyOnly = { ...base("ready"), status: "paid" };
const cancelled = {
  ...base("cancelled"),
  status: "cancelled",
  pickedUpAt: "2026-10-05T00:00:00Z",
};
const prior = {
  ...base("prior"),
  pickupDate: "2026-09-30",
  pickedUpAt: "2026-10-01T00:00:00Z",
  items: [item("Old Mango", '6"', 1, 50)],
  addons: [],
};
assert.equal(reportFulfilled(pickup), true);
assert.equal(reportFulfilled(delivery), true);
assert.equal(reportFulfilled(dine), true);
assert.equal(reportFulfilled(readyOnly), false);
assert.equal(reportFulfilled(cancelled), false);
assert.equal(reportFulfilled({ ...delivery, deliveredAt: null }), false);
const report = buildMonthlyReport(
  [pickup, delivery, dine, readyOnly, cancelled, prior],
  "2026-10",
);
assert.equal(report.scheduled, 5);
assert.equal(report.fulfilled, 3);
assert.equal(report.unfulfilled, 1);
assert.equal(report.cancelled, 1);
assert.equal(report.cakeQuantity, 5);
assert.equal(report.grossProducts, 283);
assert.equal(report.gross, 286);
assert.equal(report.discounts, 10);
assert.equal(report.other, -4);
assert.equal(report.netSales, 276);
assert.equal(report.aov, 92);
assert.equal(report.methods.find((row) => row.method === "pickup")?.aov, 176);
assert.equal(report.reconciliation, 0);
assert.equal(buildMonthlyReport([prior], "2026-09").aov, 50);
assert.equal(
  report.cakes.find((row) => row.cakeName === "Old Mango")?.quantity,
  2,
);
assert.equal(
  report.cakes.find((row) => row.cakeName === "Old Mango")?.revenue,
  100,
);
assert.equal(
  report.methods.find((row) => row.method === "dine_in")?.fulfilled,
  1,
);
assert.equal(
  report.methods.find((row) => row.method === "delivery")?.deliveryConcessions,
  10,
);
assert.equal(report.freshPicks.orders, 1);
assert.equal(
  report.sources.find((row) => row.source === "last_minute")?.fulfilled,
  1,
);
assert.equal(report.discountedOrders, 1);
assert.equal(report.outstandingNow, 374);
assert.equal(buildMonthlyReport([prior], "2026-09").netSales, 50);
assert.equal(buildMonthlyReport([], "2026-10").netSales, 0);
assert.equal(classifyAdjustment(adjustment(-2, "manual")), "other");
assert.equal(
  classifyAdjustment(adjustment(-10, "voucher", "rm10_physical_card")),
  "discount",
);
assert.equal(orderFinancials(pickup).settlement.verifiedPaymentsAllocated, 90);
assert.equal(orderFinancials(pickup).settlement.refundsTotal, 5);
assert.equal(
  summarizeCash(
    [
      {
        amount: 100,
        effectiveAmount: 90,
        status: "verified",
        method: "online_transfer",
        paidAt: "2026-09-29",
      },
      {
        amount: 20,
        effectiveAmount: 20,
        status: "verified",
        method: "wb_qr",
        paidAt: "2026-09-30",
      },
    ],
    [{ amount: 5, status: "recorded", refundedAt: "2026-10-10" }],
  ).collected,
  110,
);
assert.equal(
  summarizeCash(
    [],
    [{ amount: 5, status: "recorded", refundedAt: "2026-10-10" }],
  ).refunds,
  5,
);
assert.equal(previousMonth("2026-01"), "2025-12");
assert.equal(percentChange(10, 0), null);
assert.equal(percentChange(11, 10), 10);
assert.equal(isReportOwner("owner"), true);
for (const role of [
  "manager",
  "bakery",
  "collection",
  "customer_operations",
  null,
])
  assert.equal(isReportOwner(role), false);
const nav = readFileSync("src/foundation/navigation/workspaces.ts", "utf8");
const page = readFileSync(
  "src/app/(app)/owner/management/reports/page.tsx",
  "utf8",
);
const loader = readFileSync("src/workspaces/owner/reports/queries.ts", "utf8");
const managementPage = readFileSync(
  "src/app/(app)/owner/management/page.tsx",
  "utf8",
);
const settingsPage = readFileSync("src/app/(app)/settings/page.tsx", "utf8");
const sidebar = readFileSync(
  "src/components/shell/SidebarNavigation.tsx",
  "utf8",
);
const mobileNavigation = readFileSync(
  "src/components/shell/MobileNavigation.tsx",
  "utf8",
);
const ownerNav = getNavigationForRole("owner").find(
  (item) => item.id === "management",
);
const managerNav = getNavigationForRole("manager").find(
  (item) => item.id === "management",
);
assert.ok(ownerNav);
assert.ok(managerNav);
assert.equal(
  ownerNav.children?.map((child) => child.label).join(","),
  "Financial,Staff",
);
assert.equal(
  managerNav.children?.map((child) => child.label).join(","),
  "Staff",
);
assert.equal(isWorkspaceNavActive(ownerNav, "/owner/management/reports"), true);
assert.equal(isWorkspaceNavActive(managerNav, "/settings/staff"), true);
assert.match(nav, /owner: \[[\s\S]*?"management"/);
assert.match(nav, /manager: \[[\s\S]*?"management"/);
assert.match(managementPage, /canManageStaff\(staff\.role\.code\)/);
assert.match(managementPage, /staff\.role\.code === "owner"/);
assert.match(managementPage, /href: "\/settings\/staff"/);
assert.match(sidebar, /item\.children\?\.length/);
assert.doesNotMatch(mobileNavigation, /item\.children/);
assert.doesNotMatch(settingsPage, /href="\/settings\/staff"/);
assert.match(settingsPage, /StaffPasskeySettings/);
assert.match(settingsPage, /StaffPasswordSettings/);
assert.match(settingsPage, /StaffUsernameForm/);
assert.match(settingsPage, /StaffProfileForm/);
assert.match(page, /isReportOwner\(staff\.role\.code\)/);
assert.match(loader, /await requireReportOwner\(\)/);
assert.match(loader, /method === "drive_through" \? "pickup"/);
console.log(
  "Management reports calculations, role-specific navigation, report guards, personal settings, and fulfilment reconciliation passed.",
);
