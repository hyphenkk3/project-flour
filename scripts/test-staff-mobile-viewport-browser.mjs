/** Browser regression for content-driven staff viewport expansion. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const esbuild = require("/Users/ycwee/.npm/_npx/95c8da6ffd4052b6/node_modules/esbuild");
const { chromium } = require(
  "/Users/ycwee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const root = process.cwd();
const dependencyRoot = process.env.PROJECT_FLOUR_TEST_DEP_ROOT ?? root;
const buildRoot = process.env.PROJECT_FLOUR_TEST_BUILD_ROOT ?? root;

const entry = `
import React from "react";
import {createRoot} from "react-dom/client";
import {TopHeader} from "@/components/shell/TopHeader";
import {PageContainer} from "@/components/shell/PageContainer";
import {MobileNavigation} from "@/components/shell/MobileNavigation";
import {getNavigationForRole} from "@/foundation/navigation/workspaces";
import {CustomerOperationsNav} from "@/workspaces/customer-operations/CustomerOperationsNav";
import {OrderDirectory} from "@/workspaces/customer-operations/orders/OrderDirectory";
import {OrderSummaryCards} from "@/workspaces/customer-operations/orders/OrderSummaryCards";
import {OperationsBoardToolbar} from "@/workspaces/owner/OperationsBoardToolbar";
import {OwnerOrderCard} from "@/workspaces/owner/orders/OwnerOrderCard";
import {DEFAULT_OPERATIONS_QUERY} from "@/engines/operations/order-board";

const root = createRoot(document.getElementById("root"));
const customerOrder = {
  id: "test-order", orderNumber: "ORD-20261006-0002", customerId: null,
  fulfilmentMethod: "pickup", pickupDate: "2026-10-19", pickupTime: "12:00",
  status: "awaiting_payment", paymentStatus: "paid", internalNotes: null,
  customerNotes: null, guestName: "DEV TEST CUSTOMER", guestPhone: null,
  guestEmail: null, createdBy: null, updatedBy: null,
  createdAt: "2026-10-15T12:00:00Z", updatedAt: "2026-10-15T12:00:00Z",
  customer: null,
};
const operationsOrder = {
  id: "test-order", orderNumber: "ORD-20261006-0002",
  customerName: "DEV TEST CUSTOMER", phone: "",
  cakeName: "Pistachio Chocolate (Less Sweet)", sizeLabel: '6"',
  additionalItemCount: 0, pickupDate: "2026-10-19", pickupTime: "12:00",
  status: "awaiting_payment", createdAt: "2026-10-15T12:00:00Z",
  confirmationNeedsResend: false, orderSource: "website", crewOrder: false,
  extraStockId: null, fulfilmentMethod: "pickup", productionStartedAt: null,
  readyAt: null, pickedUpAt: null, outForDeliveryAt: null, deliveredAt: null,
  paymentDeadlineAt: null, hasPendingFeeRequest: false,
};
const longCustomer = "AVeryLongCustomerNameWithoutBreaks123456789012345678901234567890";
const longCake = "CakeNameWithoutAnyBreaks123456789012345678901234567890";

window.renderScenario = (screen, role, longContent) => {
  const displayName = role === "customer_operations" ? "Vivian" : role === "manager" ? "lily" : "wee";
  const roleName = role === "customer_operations" ? "Customer Operations" : role === "manager" ? "Manager" : "Owner";
  root.render(<>
    <TopHeader title={screen === "orders" ? "Customer Operations" : "Operations"}
      staff={{displayName, role: {name: roleName, code: role}}}/>
    <PageContainer>
      {screen === "orders" ? <>
        <CustomerOperationsNav showApprovalsLink={role === "manager"}/>
        <OrderSummaryCards orders={[customerOrder]}/>
        <OrderDirectory orders={[{...customerOrder, guestName: longContent ? longCustomer : customerOrder.guestName}]}/>
      </> : <>
        <OperationsBoardToolbar query={{...DEFAULT_OPERATIONS_QUERY, pickupFilter: "custom"}}
          matchCount={1} pendingApprovalCount={0} onChange={() => {}}/>
        <div className="mt-4"><OwnerOrderCard order={{...operationsOrder, cakeName: longContent ? longCake : operationsOrder.cakeName}}/></div>
      </>}
    </PageContainer>
    <MobileNavigation items={getNavigationForRole(role)}
      currentPath={screen === "orders" ? "/customer-operations/orders" : "/owner"}/>
    <span data-scenario={screen + ":" + role + ":" + longContent} hidden/>
  </>);
};
`;
const virtualModules = {
  "@/foundation/auth/actions": "export const logoutAction = async () => {};",
  "next/navigation": "export const usePathname = () => '/customer-operations/orders';",
  "next/link": `import React from "react"; export default function Link({href,children,scroll,...props}) { return React.createElement("a", {href,...props}, children); }`,
};
const bundle = await esbuild.build({
  stdin: {
    contents: entry,
    resolveDir: root,
    sourcefile: "staff-mobile-viewport-regression.tsx",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  tsconfig: path.join(root, "tsconfig.json"),
  nodePaths: [path.join(dependencyRoot, "node_modules")],
  plugins: [{
    name: "test-boundaries",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) =>
        Object.hasOwn(virtualModules, args.path)
          ? { path: args.path, namespace: "test-boundary" }
          : undefined);
      build.onLoad({ filter: /.*/, namespace: "test-boundary" }, (args) => ({
        contents: virtualModules[args.path],
        loader: "tsx",
        resolveDir: root,
      }));
    },
  }],
});
const cssDir = path.join(buildRoot, ".next/static/chunks");
const cssName = readdirSync(cssDir).find((name) =>
  name.endsWith(".css") &&
  readFileSync(path.join(cssDir, name), "utf8").includes(".bg-signal"));
assert.ok(cssName, "production CSS exists; run the production build first");
const css = readFileSync(path.join(cssDir, cssName), "utf8");
const server = createServer((req, res) => {
  if (req.url === "/bundle.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(bundle.outputFiles[0].text);
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const page = await browser.newPage({
    viewport: { width: 375, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(`http://127.0.0.1:${address.port}`);
  const scenarios = [
    ["orders", "customer_operations"],
    ["orders", "manager"],
    ["orders", "owner"],
    ["operations", "manager"],
    ["operations", "owner"],
  ];
  for (const [screen, role] of scenarios) {
    for (const longContent of [false, true]) {
      await page.evaluate((args) => window.renderScenario(...args), [screen, role, longContent]);
      await page.waitForFunction((expected) =>
        document.querySelector("[data-scenario]")?.getAttribute("data-scenario") === expected,
      `${screen}:${role}:${longContent}`);
      for (const width of [375, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        const geometry = await page.evaluate(() => {
          const nav = document.querySelector('nav[aria-label="Workspaces"]');
          const title = document.querySelector("header h1");
          const card = document.querySelector('ul.grid.gap-3 > li a, a.rounded-xl');
          const bounds = (element) => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, width: rect.width };
          };
          return {
            innerWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            titleWidth: title.clientWidth,
            titleContentWidth: title.scrollWidth,
            header: bounds(document.querySelector("header")),
            card: bounds(card),
            nav: bounds(nav),
            navLinks: [...nav.querySelectorAll("a")].map(bounds),
          };
        });
        const context = `${screen}/${role}/${longContent ? "long" : "normal"}/${width}px`;
        assert.equal(geometry.innerWidth, width, `${context}: layout viewport stays device-width`);
        assert.equal(geometry.scrollWidth, width, `${context}: no page-level overflow`);
        assert.ok(geometry.titleContentWidth <= geometry.titleWidth + 1, `${context}: header title remains readable`);
        assert.ok(geometry.header.right <= width + 1, `${context}: header fits`);
        assert.ok(geometry.card.right <= width + 1, `${context}: order card fits`);
        assert.ok(geometry.nav.right <= width + 1, `${context}: bottom navigation fits`);
        assert.ok(geometry.navLinks.every((link) => link.left >= -1 && link.right <= width + 1), `${context}: navigation links fit`);
      }
    }
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  assert.equal(await page.locator('nav[aria-label="Workspaces"]').evaluate((element) => getComputedStyle(element).display), "none", "desktop hides mobile navigation");
  console.log("PASS staff mobile viewport: 375/390/430px, all relevant roles, long order content, header, filters, cards, navigation, and desktop hiding");
} finally {
  await browser.close();
  server.close();
}
