/** Rendered route-title regression for the shared authenticated staff shell. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const esbuild = require("/Users/ycwee/.npm/_npx/95c8da6ffd4052b6/node_modules/esbuild");
const { chromium } = require(
  "/Users/ycwee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const root = process.cwd();

const routeGroups = [
  [
    "Bakery",
    [
      "/bakery",
      "/bakery/availability",
      "/bakery/extra",
      "/bakery/orders/sample-id",
    ],
  ],
  ["Collection", ["/collection", "/collection/orders/sample-id"]],
  [
    "Customer Operations",
    [
      "/customer-operations",
      "/customer-operations/customers",
      "/customer-operations/customers/new",
      "/customer-operations/customers/sample-id",
      "/customer-operations/customers/sample-id/edit",
      "/customer-operations/customers/sample-id/addresses/new",
      "/customer-operations/customers/sample-id/addresses/sample-address/edit",
      "/customer-operations/fresh-picks",
      "/customer-operations/orders",
      "/customer-operations/orders/new",
      "/customer-operations/orders/sample-id",
      "/customer-operations/orders/sample-id/edit",
    ],
  ],
  ["Home", ["/home"]],
  [
    "Library",
    [
      "/library",
      "/library/assets",
      "/library/assets/new",
      "/library/assets/sample-id",
      "/library/assets/sample-id/edit",
      "/library/cakes",
      "/library/cakes/new",
      "/library/cakes/sample-id",
      "/library/cakes/sample-id/edit",
      "/library/cakes/categories",
      "/library/cakes/tags",
      "/library/collections",
      "/library/collections/new",
      "/library/collections/sample-id",
      "/library/collections/sample-id/edit",
      "/library/customer-qa",
      "/library/operating-hours",
      "/library/order-availability",
      "/library/promotions",
      "/library/promotions/new",
      "/library/promotions/sample-id",
      "/library/promotions/sample-id/edit",
      "/library/vouchers",
      "/library/vouchers/new",
      "/library/vouchers/sample-id",
      "/library/vouchers/sample-id/edit",
      "/library/vouchers/rm10",
      "/library/vouchers/rm10/new",
      "/library/vouchers/rm10/sample-voucher",
    ],
  ],
  [
    "Management",
    [
      "/owner/management",
      "/owner/management/reports",
      "/settings/staff",
    ],
  ],
  [
    "Operations",
    [
      "/owner",
      "/owner/approvals",
      "/owner/approvals/history",
      "/owner/orders/new",
      "/owner/orders/sample-id",
      "/owner/orders/sample-id/confirmation",
      "/owner/orders/sample-id/payment",
    ],
  ],
  [
    "Whole Cake Calendar",
    ["/owner/calendar"],
  ],
  [
    "Settings",
    ["/settings", "/settings/customer-message-templates"],
  ],
];

const routeCases = routeGroups.flatMap(([title, paths]) =>
  paths.map((route) => ({ route, title })),
);
assert.equal(routeCases.length, 61, "all authenticated page routes are covered");

const entry = `
import React from "react";
import {createRoot} from "react-dom/client";
import {AppShellFrame} from "@/components/shell/AppShellFrame";
import {getNavigationForRole} from "@/foundation/navigation/workspaces";
const profile={id:"owner-1",displayName:"Owner",username:"owner",role:{code:"owner",name:"Owner"}};
const navigation=getNavigationForRole("owner");
createRoot(document.getElementById("root")).render(
  <AppShellFrame staff={profile} navigation={navigation} notificationPreferences={[]}>
    <main data-testid="route-content">Synthetic route content</main>
  </AppShellFrame>
);
`;

const virtualModules = {
  "next/link": `import React from "react"; export default function Link({href,children,onClick,...props}) { return React.createElement("a", {href,...props, onClick:(event)=>{onClick?.(event);if(!event.defaultPrevented&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();history.pushState({},"",href);window.dispatchEvent(new PopStateEvent("popstate"));}}}, children); }`,
  "next/navigation": `import {useSyncExternalStore} from "react"; const subscribe=(callback)=>{window.addEventListener("popstate",callback);return()=>window.removeEventListener("popstate",callback)}; const snapshot=()=>window.location.pathname; export function usePathname(){return useSyncExternalStore(subscribe,snapshot,snapshot);}`,
  "@/foundation/auth/actions": `export async function logoutAction(){}`,
  "@/components/shell/StaffNotificationListener": `export function StaffNotificationListener(){return null}`,
  "@/components/ui/Toast": `export function ToastProvider({children}){return children}`,
};

const bundle = await esbuild.build({
  stdin: {
    contents: entry,
    resolveDir: root,
    sourcefile: "staff-header-route-titles.tsx",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  tsconfig: path.join(root, "tsconfig.json"),
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

const css = readFileSync(path.join(root, ".next/test-static/combined.css"), "utf8");
const server = createServer((req, res) => {
  if (req.url?.startsWith("/bundle.js")) {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(bundle.outputFiles[0].text);
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const widths = [320, 375, 390, 430, 1440];

  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    for (const { route, title } of routeCases) {
      await page.goto(`${baseUrl}${route}`);
      await page.waitForFunction((expected) => document.querySelector("header h1")?.textContent === expected, title);
      const result = await page.evaluate(() => {
        const settings = document.querySelector("header a[href='/settings']").getBoundingClientRect();
        const signOut = document.querySelector("header button[type='submit']").getBoundingClientRect();
        const settingsRange = document.createRange();
        settingsRange.selectNodeContents(document.querySelector("header a[href='/settings']"));
        const signOutRange = document.createRange();
        signOutRange.selectNodeContents(document.querySelector("header button[type='submit']"));
        const a = settingsRange.getBoundingClientRect(), b = signOutRange.getBoundingClientRect();
        return {
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          settingsTop: settings.top,
          settingsBottom: settings.bottom,
          signOutTop: signOut.top,
          signOutBottom: signOut.bottom,
          settingsCenter: (a.top + a.bottom) / 2,
          signOutCenter: (b.top + b.bottom) / 2,
          headerHeight: document.querySelector("header").getBoundingClientRect().height,
        };
      });
      assert.equal(result.scrollWidth, width, `${route} at ${width}px has no horizontal overflow`);
      assert.ok(Math.abs(result.settingsTop - result.signOutTop) <= 0.5, `${route} at ${width}px Settings and Sign out top edges remain aligned`);
      assert.ok(Math.abs(result.settingsBottom - result.signOutBottom) <= 0.5, `${route} at ${width}px Settings and Sign out bottom edges remain aligned`);
      assert.ok(Math.abs(result.settingsCenter - result.signOutCenter) <= 0.5, `${route} at ${width}px Settings and Sign out rendered centers remain aligned`);
      if (width < 768) assert.ok(result.settingsBottom - result.settingsTop >= 44, `${route} at ${width}px retains touch-target height`);

      if (width === 390) {
        await page.reload();
        await page.waitForFunction((expected) => document.querySelector("header h1")?.textContent === expected, title);
      }
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/home`);
  for (const { href, title } of [
    { href: "/home", title: "Home" },
    { href: "/owner", title: "Operations" },
    { href: "/owner/calendar", title: "Whole Cake Calendar" },
    { href: "/bakery", title: "Bakery" },
    { href: "/collection", title: "Collection" },
    { href: "/library/cakes", title: "Library" },
    { href: "/customer-operations/customers", title: "Customer Operations" },
    { href: "/owner/management", title: "Management" },
  ]) {
    await page.locator(`nav[aria-label='Workspaces'].fixed a[href='${href}']`).click();
    await page.waitForFunction((expected) => document.querySelector("header h1")?.textContent === expected, title);
  }

  await page.goto(`${baseUrl}/owner/calendaristic`);
  await page.waitForFunction(() => document.querySelector("header h1")?.textContent === "Operations");
  await page.goto(`${baseUrl}/owner/managementx`);
  await page.waitForFunction(() => document.querySelector("header h1")?.textContent === "Operations");
  await page.goto(`${baseUrl}/collection/?tab=ready`);
  await page.waitForFunction(() => document.querySelector("header h1")?.textContent === "Collection");

  console.log(`PASS rendered staff header titles: ${routeCases.length} actual page routes × ${widths.length} viewport widths; direct load and refresh; bottom-tab navigation; prefix-boundary and trailing-slash checks; Settings/Sign out geometry preserved`);
} finally {
  await browser.close();
  server.close();
}
