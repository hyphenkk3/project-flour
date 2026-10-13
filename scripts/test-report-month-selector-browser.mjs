/** Browser regression test for the native report month/year selector. */
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
const entry = `
import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {ManagementReportDashboard} from "@/workspaces/owner/reports/ManagementReportDashboard";
function previousMonth(month) {
  const [year, number] = month.split("-").map(Number);
  return number === 1 ? (year - 1) + "-12" : year + "-" + String(number - 1).padStart(2, "0");
}
function makeMonth(month) {
  return {
    month, netSales:0, gross:0, grossProducts:0, discounts:0, netProducts:0,
    delivery:0, processing:0, other:0, fulfilled:0, aov:0, outstandingNow:0,
    reconciliation:0, unfulfilled:0, unfulfilledValue:0, cancelled:0,
    cancelledValue:0, cakeQuantity:0, cakes:[], sizes:[], methods:[],
    discountedOrders:0, discountReasons:[], sources:[], freshPicks:{orders:0,netSales:0},
  };
}
function Harness() {
  const [month, setMonth] = useState(new URLSearchParams(location.search).get("month") || "2026-09");
  window.navigateReport = (href) => {
    const url = new URL(href, location.origin);
    window.lastReportUrl = url.pathname + url.search;
    setMonth(url.searchParams.get("month") || "2026-09");
  };
  return <ManagementReportDashboard report={{current:makeMonth(month),previous:makeMonth(previousMonth(month)),bookings:{count:0,value:0,sources:[]},payments:{collected:0,refunds:0,methods:[]},asOf:"2026-10-13T00:00:00Z"}}/>;
}
createRoot(document.getElementById("root")).render(<Harness/>);
`;
const virtualModules = {
  "next/link": `import React from "react"; export default function Link({href,children,scroll,...props}) { return React.createElement("a", {href, ...props, onClick(event) { event.preventDefault(); window.lastScrollOption = scroll; window.navigateReport?.(href); }}, children); }`,
  "next/navigation": `export function useRouter() { return { push(href, options) { window.lastScrollOption = options?.scroll; window.navigateReport?.(href); } }; }`,
};
const build = await esbuild.build({
  stdin: {
    contents: entry,
    resolveDir: root,
    sourcefile: "report-month-selector-regression.tsx",
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
const bundle = build.outputFiles[0].text;
const cssName = readdirSync(path.join(root, ".next/static/chunks")).find(
  (name) => name.endsWith(".css"),
);
assert.ok(cssName, "production CSS exists; run the production build first");
const css = readFileSync(
  path.join(root, ".next/static/chunks", cssName),
  "utf8",
);
const server = createServer((req, res) => {
  if (req.url?.startsWith("/bundle.js")) {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(bundle);
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`,
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
    locale: "ja-JP",
  });
  await page.addInitScript(() => {
    window.fetch = (input) => {
      window.lastExportUrl = String(input);
      return new Promise((resolve) => {
        window.finishReportExport = () =>
          resolve(new Response(new Blob(["verified report"]), { status: 200 }));
      });
    };
    URL.createObjectURL = () => "blob:http://localhost/report";
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () {
      window.lastDownload = { href: this.href, filename: this.download };
    };
  });
  await page.goto(`http://127.0.0.1:${address.port}/?month=2026-09`);
  const monthLabel = page.locator('nav[aria-label="Report month navigation"]');
  const picker = page.getByLabel("Choose report month and year");
  await page.getByText("September 2026", { exact: true }).waitFor();
  const exportPdf = page.locator("button").filter({ hasText: /PDF/ });
  const exportExcel = page.locator("button").filter({ hasText: /Excel/ });
  assert.equal(await exportPdf.count(), 1);
  assert.equal(await exportExcel.count(), 1);
  assert.equal(await picker.getAttribute("type"), "month");
  assert.equal(await picker.getAttribute("min"), "2020-01");
  assert.equal(await picker.getAttribute("max"), "2026-10");
  assert.ok(Number(await picker.getAttribute("tabindex")) >= 0);
  assert.equal(
    await page.getByText("Choose month", { exact: true }).count(),
    0,
  );
  assert.equal(await page.getByRole("button", { name: "Go" }).count(), 0);
  assert.equal(await page.locator("form").count(), 0);

  await exportPdf.click();
  await page.getByRole("button", { name: "Preparing PDF…" }).waitFor();
  assert.equal(await exportPdf.isDisabled(), true);
  assert.equal(await exportExcel.isDisabled(), true, "duplicate export requests are blocked");
  assert.equal(
    await page.evaluate(() => window.lastExportUrl),
    "/api/owner/management/reports/export/pdf?month=2026-09",
  );
  await page.evaluate(() => window.finishReportExport());
  await page.waitForFunction(() => window.lastDownload?.filename === "Whitebird_Report_2026-09.pdf");
  await exportExcel.click();
  await page.getByRole("button", { name: "Preparing Excel…" }).waitFor();
  assert.equal(
    await page.evaluate(() => window.lastExportUrl),
    "/api/owner/management/reports/export/excel?month=2026-09",
  );
  await page.evaluate(() => window.finishReportExport());
  await page.waitForFunction(() => window.lastDownload?.filename === "Whitebird_Report_2026-09.xlsx");

  await monthLabel
    .getByRole("link", { name: "Next month: October 2026" })
    .click();
  await page.getByText("October 2026", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.lastReportUrl),
    "/owner/management/reports?month=2026-10",
  );
  assert.equal(await page.evaluate(() => window.lastScrollOption), false);
  assert.equal(
    await monthLabel.getByRole("link", { name: /Next month/ }).count(),
    0,
  );
  assert.equal(
    await monthLabel
      .getByLabel("Next month unavailable")
      .getAttribute("aria-disabled"),
    "true",
  );

  await picker.evaluate((element) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(element, "2026-08");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByText("August 2026", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.lastReportUrl),
    "/owner/management/reports?month=2026-08",
  );

  await page.goto(`http://127.0.0.1:${address.port}/?month=2026-01`);
  await page.getByText("January 2026", { exact: true }).waitFor();
  await monthLabel
    .getByRole("link", { name: "Previous month: December 2025" })
    .click();
  await page.getByText("December 2025", { exact: true }).waitFor();
  await monthLabel
    .getByRole("link", { name: "Next month: January 2026" })
    .click();
  await page.getByText("January 2026", { exact: true }).waitFor();

  for (const width of [320, 375, 390, 393, 430]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.getByRole("button", { name: "Export PDF" }).isVisible(), true);
    assert.equal(await page.getByRole("button", { name: "Export Excel" }).isVisible(), true);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      `report month selector and export controls fit a ${width}px phone viewport`,
    );
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(
    await monthLabel.isVisible(),
    true,
    "month selector is available on desktop",
  );
  assert.equal(
    await monthLabel.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
    true,
    "month selector fits on desktop",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "desktop month selector does not cause horizontal page overflow",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log(
  "Report month selector browser checks passed for navigation, direct month selection, URL/data synchronization, year boundaries, future-month blocking, English display, keyboard label, and mobile width.",
);
