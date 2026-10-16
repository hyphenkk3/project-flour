/** Regression for staff order cards inside their actual grid and shell layout. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const esbuild = require("/Users/ycwee/.npm/_npx/95c8da6ffd4052b6/node_modules/esbuild");
const {
  chromium,
} = require("/Users/ycwee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = process.cwd();
const buildRoot = process.env.PROJECT_FLOUR_TEST_BUILD_ROOT ?? root;
const boardSource = readFileSync(
  path.join(root, "src/workspaces/owner/OperationsLiveBoard.tsx"),
  "utf8",
);
const ownerListItemClass =
  boardSource.match(/<li(?: className="([^"]+)")? key=\{order\.id\}>/)?.[1] ??
  "";

const entry = `
import React from "react";
import {createRoot} from "react-dom/client";
import {AppShell} from "@/components/shell/AppShell";
import {getNavigationForRole} from "@/foundation/navigation/workspaces";
import {CustomerOperationsNav} from "@/workspaces/customer-operations/CustomerOperationsNav";
import {OrderDirectory} from "@/workspaces/customer-operations/orders/OrderDirectory";
import {OrderSummaryCards} from "@/workspaces/customer-operations/orders/OrderSummaryCards";
import {OperationsBoardToolbar} from "@/workspaces/owner/OperationsBoardToolbar";
import {OwnerOrderCard} from "@/workspaces/owner/orders/OwnerOrderCard";
import {DEFAULT_OPERATIONS_QUERY} from "@/engines/operations/order-board";

const root = createRoot(document.getElementById("root"));
const name = "Alexandra Christine Tan Mei Ling Wei Jia Customer";
const cake = "Pistachio Chocolate (Less Sweet) Celebration";
const unbroken = "PistachioChocolateLessSweetCelebrationCakeSpecialEdition";
const statuses = [
  ["awaiting_payment", "paid"],
  ["pending_confirmation", "unpaid"],
  ["cancelled", "refunded"],
];

window.renderScenario = (screen, role, variant) => {
  const displayName = role === "customer_operations" ? "Vivian" : role === "manager" ? "lily" : "wee";
  const roleName = role === "customer_operations" ? "Customer Operations" : role === "manager" ? "Manager" : "Owner";
  const customerName = variant === "long-name" || variant === "long" ? name
    : variant === "unbroken-name" ? unbroken : "DEV TEST CUSTOMER";
  const cakeName = variant === "long-cake" || variant === "long" ? cake
    : variant === "unbroken-cake" ? unbroken : "Chocolate Banana";
  const base = {
    id: "test-order", orderNumber: "ORD-20261014-0001", customerId: null,
    fulfilmentMethod: "pickup", pickupDate: "2026-10-19", pickupTime: "12:00",
    internalNotes: null, customerNotes: null, guestPhone: null, guestEmail: null,
    createdBy: null, updatedBy: null, createdAt: "2026-10-15T12:00:00Z",
    updatedAt: "2026-10-15T12:00:00Z", customer: null,
  };
  const customerOrders = statuses.map(([status,paymentStatus],i) => ({
    ...base, id: "customer-"+i, guestName: customerName,
    status, paymentStatus,
  }));
  const ownerOrders = statuses.map(([status],i) => ({
    id: "owner-"+i, orderNumber: base.orderNumber, customerName,
    phone: "", cakeName, sizeLabel: '6"', additionalItemCount: i,
    pickupDate: base.pickupDate, pickupTime: base.pickupTime,
    status, createdAt: base.createdAt, confirmationNeedsResend: false,
    orderSource: "website", crewOrder: false, extraStockId: null,
    fulfilmentMethod: "pickup", productionStartedAt: null, readyAt: null,
    pickedUpAt: null, outForDeliveryAt: null, deliveredAt: null,
    paymentDeadlineAt: null, hasPendingFeeRequest: false,
  }));
  root.render(
    <AppShell currentPath={screen === "operations" ? "/owner" : "/customer-operations/orders"}
      navigation={getNavigationForRole(role)}
      staff={{displayName, role: {name: roleName, code: role}}}
      title={screen === "operations" ? "Operations" : "Customer Operations"}>
      {screen === "operations" ? <div className="space-y-5">
        <OperationsBoardToolbar query={{...DEFAULT_OPERATIONS_QUERY, pickupFilter: "custom"}}
          matchCount={ownerOrders.length} pendingApprovalCount={0} onChange={() => {}}/>
        <ul className="grid gap-3" data-test-order-list="operations">
          {ownerOrders.map(order => <li className={${JSON.stringify(ownerListItemClass)}} key={order.id}><OwnerOrderCard order={order}/></li>)}
        </ul>
      </div> : <div>
        <CustomerOperationsNav showApprovalsLink={role === "manager"}/>
        <div className="space-y-6">
          <OrderSummaryCards orders={customerOrders}/>
          <OrderDirectory orders={customerOrders}/>
        </div>
      </div>}
    </AppShell>
  );
  document.body.dataset.scenario = screen+":"+role+":"+variant;
};
`;

const virtualModules = {
  "@/foundation/auth/actions": "export const logoutAction = async () => {};",
  "next/navigation":
    "export const usePathname = () => '/customer-operations/orders';",
  "next/link": `import React from "react"; export default function Link({href,children,scroll,...props}) { return React.createElement("a", {href,...props}, children); }`,
};
const bundle = await esbuild.build({
  stdin: {
    contents: entry,
    resolveDir: root,
    sourcefile: "staff-order-card-bounds.tsx",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  tsconfig: path.join(root, "tsconfig.json"),
  nodePaths: [path.join(root, "node_modules")],
  plugins: [
    {
      name: "test-boundaries",
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) =>
          Object.hasOwn(virtualModules, args.path)
            ? { path: args.path, namespace: "test-boundary" }
            : undefined,
        );
        build.onLoad({ filter: /.*/, namespace: "test-boundary" }, (args) => ({
          contents: virtualModules[args.path],
          loader: "tsx",
          resolveDir: root,
        }));
      },
    },
  ],
});
const cssDir = path.join(buildRoot, ".next/static/chunks");
const cssName = readdirSync(cssDir).find(
  (name) =>
    name.endsWith(".css") &&
    readFileSync(path.join(cssDir, name), "utf8").includes(".bg-signal"),
);
assert.ok(cssName, "production CSS exists; run the production build first");
const css = readFileSync(path.join(cssDir, cssName), "utf8");
const server = createServer((req, res) => {
  if (req.url === "/bundle.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(bundle.outputFiles[0].text);
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`,
  );
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const page = await browser.newPage({
    viewport: { width: 375, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(`http://127.0.0.1:${address.port}`);
  for (const role of ["owner", "manager", "customer_operations"]) {
    for (const screen of ["operations", "directory"]) {
      for (const variant of [
        "normal",
        "long-name",
        "long-cake",
        "long",
        "unbroken-name",
        "unbroken-cake",
      ]) {
        await page.evaluate(
          (args) => window.renderScenario(...args),
          [screen, role, variant],
        );
        await page.waitForFunction(
          (expected) => document.body.dataset.scenario === expected,
          `${screen}:${role}:${variant}`,
        );
        for (const width of [375, 390, 430]) {
          await page.setViewportSize({ width, height: 844 });
          const g = await page.evaluate((screen) => {
            const list =
              screen === "operations"
                ? document.querySelector('[data-test-order-list="operations"]')
                : document
                    .querySelector("#order-search")
                    .closest(".space-y-4")
                    .querySelector("ul.grid.gap-3");
            const rect = (element) => {
              const r = element.getBoundingClientRect();
              return {
                left: r.left,
                right: r.right,
                top: r.top,
                bottom: r.bottom,
                width: r.width,
              };
            };
            const cards = [...list.querySelectorAll(":scope > li > a")].map(
              (card) => ({
                rect: rect(card),
                item: rect(card.parentElement),
                ...(screen === "operations"
                  ? {
                      row: rect(card.firstElementChild),
                      text: rect(card.firstElementChild.firstElementChild),
                      name: rect(card.querySelector("p")),
                      cake: rect(card.querySelectorAll("p")[2]),
                      cakeFragments: (() => {
                        const range = document.createRange();
                        range.selectNodeContents(card.querySelectorAll("p")[2]);
                        return [...range.getClientRects()].map((fragment) => ({
                          left: fragment.left,
                          right: fragment.right,
                        }));
                      })(),
                      computed: {
                        itemMinWidth: getComputedStyle(card.parentElement)
                          .minWidth,
                        cardMinWidth: getComputedStyle(card).minWidth,
                        textMinWidth: getComputedStyle(
                          card.firstElementChild.firstElementChild,
                        ).minWidth,
                      },
                    }
                  : {}),
                badges: [...card.querySelectorAll("span.ring-inset")].map(
                  (badge) => ({
                    rect: rect(badge),
                    clippedBy: (() => {
                      const b = badge.getBoundingClientRect();
                      for (
                        let parent = badge.parentElement;
                        parent;
                        parent = parent.parentElement
                      ) {
                        const overflow = getComputedStyle(parent).overflowX;
                        if (
                          !["hidden", "clip", "auto", "scroll"].includes(
                            overflow,
                          )
                        )
                          continue;
                        const p = parent.getBoundingClientRect();
                        if (b.left < p.left - 1 || b.right > p.right + 1)
                          return parent.tagName;
                      }
                      return null;
                    })(),
                  }),
                ),
              }),
            );
            return {
              innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
              list: rect(list),
              cards,
            };
          }, screen);
          const context = `${screen}/${role}/${variant}/${width}px`;
          if (g.innerWidth !== width || g.scrollWidth !== width) {
            console.error("OVERFLOW_GEOMETRY", context, JSON.stringify(g));
          }
          assert.ok(g.cards.length === 3, `${context}: all three cards render`);
          assert.equal(
            g.innerWidth,
            width,
            `${context}: layout viewport stays device-width`,
          );
          assert.equal(
            g.scrollWidth,
            width,
            `${context}: no page-level horizontal overflow`,
          );
          assert.ok(
            g.list.left >= -1 && g.list.right <= width + 1,
            `${context}: list fits viewport`,
          );
          for (const [index, card] of g.cards.entries()) {
            assert.ok(
              card.rect.left >= g.list.left - 1 &&
                card.rect.right <= g.list.right + 1,
              `${context}: card ${index} fits list (${JSON.stringify({ list: g.list, card: card.rect })})`,
            );
            assert.ok(
              card.badges.length >= 1,
              `${context}: card ${index} has status badges`,
            );
            for (const [badgeIndex, badge] of card.badges.entries()) {
              assert.ok(
                badge.rect.left >= card.rect.left - 1 &&
                  badge.rect.right <= card.rect.right + 1,
                `${context}: card ${index} badge ${badgeIndex} fits card`,
              );
              assert.equal(
                badge.clippedBy,
                null,
                `${context}: card ${index} badge ${badgeIndex} is not clipped`,
              );
            }
            if (screen === "operations") {
              assert.ok(
                card.text.right <= card.badges[0].rect.left + 1,
                `${context}: card ${index} text and status badge do not overlap`,
              );
              assert.ok(
                card.cake.left >= card.rect.left &&
                  card.cake.right <= card.text.right + 1,
                `${context}: card ${index} cake text stays inside its column`,
              );
              assert.ok(
                card.cakeFragments.length > 0,
                `${context}: card ${index} cake text renders`,
              );
              for (const fragment of card.cakeFragments) {
                assert.ok(
                  fragment.left >= card.text.left - 1 &&
                    fragment.right <= card.text.right + 1,
                  `${context}: card ${index} cake glyphs stay inside the text column`,
                );
              }
            }
          }
        }
      }
    }
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.evaluate(() =>
    window.renderScenario("operations", "owner", "long"),
  );
  await page.waitForFunction(
    () => document.body.dataset.scenario === "operations:owner:long",
  );
  const desktop = await page.evaluate(() => {
    const list = document.querySelector('[data-test-order-list="operations"]');
    const listBounds = list.getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      listRight: listBounds.right,
      cardRights: [...list.querySelectorAll(":scope > li > a")].map(
        (card) => card.getBoundingClientRect().right,
      ),
    };
  });
  assert.equal(desktop.scrollWidth, 1024, "desktop has no horizontal overflow");
  assert.ok(
    desktop.cardRights.every((right) => right <= desktop.listRight + 1),
    "desktop Operations cards stay in the list",
  );
  assert.equal(
    await page
      .locator('nav[aria-label="Workspaces"].fixed')
      .evaluate((element) => getComputedStyle(element).display),
    "none",
    "desktop hides mobile navigation",
  );
  console.log(
    "PASS staff order cards, lists, and badges fit 375/390/430px across Owner, Manager, and Customer Operations",
  );
} finally {
  await browser.close();
  server.close();
}
