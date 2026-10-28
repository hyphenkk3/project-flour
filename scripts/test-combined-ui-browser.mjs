/** Browser regression for Home spacing and the collapsible, paged audit history. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const esbuild = require("/Users/ycwee/.npm/_npx/95c8da6ffd4052b6/node_modules/esbuild");
const {
  chromium,
} = require("/Users/ycwee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = process.cwd();
const entry = `
import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {AppShell} from "@/components/shell/AppShell";
import {HomeCockpit} from "@/workspaces/home/HomeCockpit";
import {getNavigationForRole} from "@/foundation/navigation/workspaces";
import {StaffCredentialActivity} from "@/components/settings/StaffCredentialActivity";
const rootNode = createRoot(document.getElementById("root"));
const navigation = getNavigationForRole("owner");
const model = {
  todayYmd:"2026-10-28",
  summary:{ordersToday:3,pickupsToday:2,deliveriesToday:1,dineInsToday:0,ready:1,completed:0,needAttention:0,pendingApprovals:0},
  attentionGroups:[],attentionPreview:[],
  handoffs:{ready:0,deliveryReady:0,pickedUp:0,outForDelivery:0,delivered:0,readyPreview:[],dineInPending:0,dineInCompleted:0,dineInPreview:[],dineInCompletedPreview:[]},
  schedule:{total:0,notStarted:0,inProduction:0,ready:0,preview:[]},quickLinks:[]
};
const profile={id:"owner-1",displayName:"Owner",username:"owner",role:{code:"owner",name:"Owner"}};
const makeEvents=(prefix,start,count)=>Array.from({length:count},(_,i)=>({id:prefix+i,eventType:"username_changed",label:"Username changed",createdAt:new Date(Date.UTC(2026,9,28,10,start-i)).toISOString(),actorName:"Owner",subjectName:"Owner",detail:"old-"+prefix+i+" → new-"+prefix+i}));
const initial={events:makeEvents("recent-",30,5),nextCursor:{createdAt:"2026-10-28T10:25:00.000Z",id:"11111111-1111-4111-8111-111111111111"},hasMore:true};
window.activityPages=[{ok:true,page:{events:makeEvents("older-",20,5),nextCursor:{createdAt:"2026-10-28T10:15:00.000Z",id:"22222222-2222-4222-8222-222222222222"},hasMore:true}},{ok:true,page:{events:makeEvents("oldest-",10,2),nextCursor:null,hasMore:false}}];
function Harness(){
 const [view,setView]=useState("Home");
 const pagePaths={"Home":"/home","Operations":"/owner","Whole Cake Calendar":"/owner/calendar","Bakery":"/bakery","Collection":"/collection","Library":"/library","Customer Operations":"/customer-operations","Management":"/owner/management","Financial Reports":"/owner/management/reports","Staff Management":"/settings/staff"};
 window.showHome=()=>setView("Home"); window.showActivity=()=>setView("Credential Activity"); window.setStaffPage=title=>setView(title);
 if(view==="Credential Activity") return <main className="mx-auto w-full max-w-5xl p-4"><StaffCredentialActivity page={initial}/></main>;
 return <AppShell currentPath={pagePaths[view]||"/owner"} staff={profile} navigation={navigation} title={view}>{view==="Home"?<HomeCockpit staffDisplayName="Owner" roleName="Owner" model={model} canAccessOperations={true} canAccessCollection={true} canAccessBakery={true} canAccessCalendar={true} canAccessApprovals={true} pendingApprovalsHref="/owner/approvals"/>:<div data-testid="workspace-placeholder"/>}</AppShell>;
}
rootNode.render(<Harness/>);
`;
const virtualModules = {
  "next/link": `import React from "react"; export default function Link({href,children,...props}) { return React.createElement("a", {href,...props}, children); }`,
  "@/foundation/auth/actions": `export async function logoutAction() {window.logoutActionCalls=(window.logoutActionCalls||0)+1}`,
  "@/workspaces/home/HomeLiveRefresh": `import React from "react"; export function HomeLiveRefresh(){return React.createElement("span",{"data-testid":"home-live-refresh"})}`,
  "@/workspaces/home/HomeFreshPicksOperations": `import React from "react"; export function HomeFreshPicksOperations(){return React.createElement("div")}`,
  "@/app/(app)/settings/staff/actions": `export async function loadOlderStaffCredentialActivityAction(cursor){window.lastActivityCursor=cursor;return window.activityPages.shift()}`,
};
const bundle = await esbuild.build({
  stdin: {
    contents: entry,
    resolveDir: root,
    sourcefile: "combined-ui-browser-regression.tsx",
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
const cssPath = path.join(root, ".next/test-static/combined.css");
assert.ok(
  readFileSync(cssPath, "utf8").includes(".bg-signal"),
  "fresh local Tailwind CSS exists; generate it before the browser test",
);
const css = readFileSync(cssPath, "utf8");
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
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(`http://127.0.0.1:${address.port}`);
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const g = await page.evaluate(() => {
      const rect = (s) => {
        const e = document.querySelector(s);
        const r = e.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          height: r.height,
          width: r.width,
        };
      };
      const header = document.querySelector("header"),
        home = document.querySelector("main .max-w-4xl"),
        today = document.querySelector("#home-today");
      const controls = [
        ...header.querySelectorAll("a[href='/settings'],button"),
      ].map((e) => ({
        rect: (() => {
          const r = e.getBoundingClientRect();
          return {
            width: r.width,
            height: r.height,
            left: r.left,
            right: r.right,
          };
        })(),
        minHeight: getComputedStyle(e).minHeight,
      }));
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        header: rect("header"),
        todayTop: today.getBoundingClientRect().top,
        homeTop: home.getBoundingClientRect().top,
        nav: rect("nav[aria-label='Workspaces']"),
        controls,
        headerTitle: rect("header h1"),
      };
    });
    assert.equal(g.width, width, `${width}px viewport`);
    assert.equal(g.scrollWidth, width, `${width}px no horizontal overflow`);
    assert.ok(
      g.todayTop > g.homeTop,
      `${width}px Today follows Home header in document flow`,
    );
    assert.ok(
      g.controls.every((c) => c.rect.height >= 44 || width >= 768),
      `${width}px Home controls retain touch height on mobile`,
    );
    if (width < 768) {
      assert.ok(
        g.nav.top >= 0 && g.nav.bottom <= 844,
        `${width}px sticky bottom navigation stays on screen`,
      );
    }
    if (width >= 768) {
      assert.ok(
        g.header.height < 130,
        `${width}px desktop header stays compact`,
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({
    top: document.querySelector("#home-today").getBoundingClientRect().top,
    headerHeight: document.querySelector("header").getBoundingClientRect()
      .height,
    gap:
      document.querySelector("#home-today").getBoundingClientRect().top -
      document.querySelector("header").getBoundingClientRect().bottom,
  }));
  await page.setViewportSize({ width: 1024, height: 768 });
  const desktop = await page.evaluate(() => ({
    top: document.querySelector("#home-today").getBoundingClientRect().top,
    headerHeight: document.querySelector("header").getBoundingClientRect()
      .height,
    gap:
      document.querySelector("#home-today").getBoundingClientRect().top -
      document.querySelector("header").getBoundingClientRect().bottom,
  }));
  assert.ok(
    desktop.gap > mobile.gap,
    `desktop retains the original generous spacing while mobile Home is compact (mobile gap=${mobile.gap}, desktop gap=${desktop.gap})`,
  );

  const workspaceTitles = [
    "Home",
    "Operations",
    "Whole Cake Calendar",
    "Bakery",
    "Collection",
    "Library",
    "Customer Operations",
    "Management",
    "Financial Reports",
    "Staff Management",
  ];
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    let expectedHeaderHeight = null;
    for (const title of workspaceTitles) {
      await page.evaluate((value) => window.setStaffPage(value), title);
      await page.waitForFunction(
        (value) => document.querySelector("header h1")?.textContent === value,
        title,
      );
      const layout = await page.evaluate(() => {
        const box = (selector) => {
          const element = document.querySelector(selector);
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
        };
        const row = box("[data-testid='staff-header-row']");
        const brand = box("[data-testid='staff-brand-group']");
        const identity = box("[data-testid='staff-identity']");
        const actions = box("[data-testid='staff-header-actions']");
        const whitebird = box("[data-testid='staff-brand-group'] p");
        const title = box("header h1");
        const settings = box("header a[href='/settings']");
        const signOut = box("header button[type='submit']");
        return {
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          headerHeight: document.querySelector("header").getBoundingClientRect().height,
          row, brand, identity, actions, whitebird, title, settings, signOut,
          rowPaddingTop: parseFloat(getComputedStyle(document.querySelector("[data-testid='staff-header-row']")).paddingTop),
          settingsHref: document.querySelector("header a[href='/settings']")?.getAttribute("href"),
          signOutType: document.querySelector("header button[type='submit']")?.type,
        };
      });
      assert.equal(layout.scrollWidth, width, `${title} ${width}px has no horizontal overflow`);
      assert.ok(layout.brand.right <= layout.identity.left + 0.5, `${title} ${width}px left and right header groups do not overlap`);
      assert.ok(Math.abs((layout.brand.top + layout.brand.bottom) / 2 - (layout.identity.top + layout.identity.bottom) / 2) <= 2, `${title} ${width}px groups share one horizontal row`);
      assert.ok(layout.title.left <= layout.whitebird.left + 1 && layout.title.top > layout.whitebird.top, `${title} ${width}px title sits below WHITEBIRD and stays left aligned`);
      assert.ok(layout.settings.left >= layout.identity.right && layout.settings.left - layout.identity.right <= (width >= 768 ? 12 : 8), `${title} ${width}px identity sits immediately beside Settings (gap=${layout.settings.left - layout.identity.right}px)`);
      assert.ok(layout.signOut.left >= layout.settings.right && layout.signOut.left - layout.settings.right <= 8, `${title} ${width}px Settings and Sign out stay grouped`);
      assert.ok(layout.actions.right <= layout.row.right + 0.5, `${title} ${width}px actions remain inside the header row`);
      assert.ok(layout.rowPaddingTop >= 12, `${title} ${width}px safe-area top clearance is retained`);
      assert.equal(layout.settingsHref, "/settings", `${title} ${width}px Settings remains a real link`);
      assert.equal(layout.signOutType, "submit", `${title} ${width}px Sign out remains a form action`);
      if (width < 1024) {
        assert.ok(layout.settings.height >= 44 && layout.signOut.height >= 44, `${title} ${width}px actions retain practical touch targets`);
      }
      if (expectedHeaderHeight === null) expectedHeaderHeight = layout.headerHeight;
      assert.ok(Math.abs(layout.headerHeight - expectedHeaderHeight) <= 1, `${title} ${width}px header height is consistent across staff pages`);
    }
  }
  await page.evaluate(() => window.showHome());
  await page.waitForFunction(() => document.querySelector("header h1")?.textContent === "Home");
  await page.evaluate(() => {
    document.querySelector("header a[href='/settings']").addEventListener("click", (event) => {
      event.preventDefault(); window.settingsActivated = true;
    }, { once: true });
    document.querySelector("header form").addEventListener("submit", (event) => {
      event.preventDefault(); window.signOutActivated = true;
    }, { once: true });
  });
  await page.locator("header a[href='/settings']").click();
  assert.equal(await page.evaluate(() => window.settingsActivated), true, "Settings control activates without leaving the synthetic harness");
  await page.locator("header button[type='submit']").click();
  assert.equal(await page.evaluate(() => window.signOutActivated), true, "Sign out control submits its form without any real session");

  await page.evaluate(() => window.showActivity());
  const details = page.locator("details");
  assert.equal(
    await details.getAttribute("open"),
    null,
    "credential history starts collapsed",
  );
  assert.equal(
    await page.getByText("old-recent-0 → new-recent-0").isVisible(),
    false,
    "audit detail is collapsed initially",
  );
  await details.locator("summary").focus();
  await page.keyboard.press("Enter");
  await details.waitFor({ state: "visible" });
  assert.equal(
    await details.evaluate((element) => element.open),
    true,
    "summary keyboard toggles native details",
  );
  assert.equal(
    await page.locator("[data-testid='credential-event']").count(),
    0,
    "event list keeps normal list semantics",
  );
  assert.equal(
    await page.getByText("Username changed").count(),
    5,
    "initial page shows five latest events",
  );
  await page.getByRole("button", { name: "Load 5 older events" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll("details ul li").length === 10,
  );
  assert.equal(
    await page.locator("ul").last().locator("li").count(),
    10,
    "one on-demand page appends without replacing recent entries",
  );
  const firstTwo = await page
    .locator("ul")
    .last()
    .locator("li")
    .evaluateAll((nodes) => nodes.slice(0, 2).map((n) => n.textContent));
  assert.match(firstTwo[0], /recent-0/);
  assert.match(firstTwo[1], /recent-1/);
  await page.getByRole("button", { name: "Load 5 older events" }).click();
  await page.getByText("old-oldest-0 → new-oldest-0").waitFor();
  assert.equal(
    await page.locator("ul").last().locator("li").count(),
    12,
    "final page stays visible and the Load more control ends",
  );
  const timestamps = await page
    .locator("details time")
    .evaluateAll((nodes) => nodes.map((node) => node.dateTime));
  assert.deepEqual(
    timestamps,
    [...timestamps].sort((a, b) => b.localeCompare(a)),
    "newest-to-oldest order is preserved across pages",
  );
  assert.equal(
    await page.getByRole("button", { name: /Load/ }).count(),
    0,
    "no more button after final page",
  );
  console.log(
    "PASS combined UI browser: actual Home/AppShell flow at 320/375/390/430/768/1024/1440px; no overflow; mobile targets and sticky nav; details keyboard toggle; 5-event first page; older pages append in descending order",
  );
} finally {
  await browser.close();
  server.close();
}
