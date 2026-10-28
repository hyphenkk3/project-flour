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
function nextMonth(month) {
  const [year, number] = month.split("-").map(Number);
  return number === 12 ? (year + 1) + "-01" : year + "-" + String(number + 1).padStart(2, "0");
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
  return <ManagementReportDashboard report={{current:makeMonth(month),previous:makeMonth(previousMonth(month)),bookings:{count:0,value:0,sources:[]},payments:{collected:0,refunds:0,methods:[]},refundBreakdown:[],asOf:"2026-10-13T00:00:00Z"}}/>;
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
  const picker = page.getByLabel("Choose report month and year");
  await page.waitForFunction(() => {
    const picker = document.querySelector('select[aria-label="Choose report month and year"]');
    return picker?.value === "2026-09";
  });
  const exportPdf = page.locator("button").filter({ hasText: /PDF/ });
  const exportExcel = page.locator("button").filter({ hasText: /Excel/ });
  const previous = page.getByRole("button", { name: "Previous report month" });
  const next = page.getByRole("button", { name: "Next report month" });
  const monthControls = page.getByRole("group", {
    name: "Report month navigation",
  });
  assert.equal(await exportPdf.count(), 1);
  assert.equal(await exportExcel.count(), 1);
  assert.equal(await previous.isVisible(), true);
  assert.equal(await next.isVisible(), true);
  assert.equal(await monthControls.count(), 1);
  assert.equal(await picker.evaluate((element) => element.tagName), "SELECT");
  assert.equal(await picker.locator('option[value="2020-01"]').count(), 1);
  assert.equal(await picker.locator('option[value="2026-10"]').count(), 1);
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

  await picker.selectOption("2026-10");
  assert.equal(
    await page.evaluate(() => window.lastReportUrl),
    "/owner/management/reports?month=2026-10",
  );
  assert.equal(await page.evaluate(() => window.lastScrollOption), false);
  await picker.selectOption("2026-08");
  assert.equal(
    await page.evaluate(() => window.lastReportUrl),
    "/owner/management/reports?month=2026-08",
  );

  await page.goto(`http://127.0.0.1:${address.port}/?month=2026-09`);
  await previous.click();
  assert.equal(
    await page.evaluate(() => window.lastReportUrl),
    "/owner/management/reports?month=2026-08",
  );
  await next.click();
  assert.equal(
    await page.evaluate(() => window.lastReportUrl),
    "/owner/management/reports?month=2026-09",
  );
  await next.focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() => window.lastReportUrl),
    "/owner/management/reports?month=2026-10",
    "keyboard activation advances the selected report month",
  );

  await page.goto(`http://127.0.0.1:${address.port}/?month=2020-01`);
  assert.equal(
    await previous.isDisabled(),
    true,
    "navigation stops at the first available month",
  );
  await next.click();
  assert.equal(
    await page.evaluate(() => window.lastReportUrl),
    "/owner/management/reports?month=2020-02",
  );
  await page.goto(`http://127.0.0.1:${address.port}/?month=2026-10`);
  assert.equal(
    await next.isDisabled(),
    true,
    "navigation stops at the current month",
  );

  await page.goto(`http://127.0.0.1:${address.port}/?month=2026-01`);
  await previous.click();
  assert.equal(
    await page.evaluate(() => window.lastReportUrl),
    "/owner/management/reports?month=2025-12",
    "previous arrow crosses the year boundary",
  );
  await next.click();
  assert.equal(
    await page.evaluate(() => window.lastReportUrl),
    "/owner/management/reports?month=2026-01",
    "next arrow crosses the year boundary",
  );

  for (const width of [
    320, 375, 390, 393, 430, 600, 768, 1024, 1280, 1440,
  ]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.getByRole("button", { name: "Export PDF" }).isVisible(), true);
    assert.equal(await page.getByRole("button", { name: "Export Excel" }).isVisible(), true);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      `report month selector and export controls fit a ${width}px viewport`,
    );
    const layout = await page.evaluate(() => {
      const nav = document
        .querySelector('[aria-label="Report month navigation"]')
        ?.getBoundingClientRect();
      const pdf = [...document.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("PDF"))
        ?.getBoundingClientRect();
      if (!nav || !pdf) return null;
      return {
        visible: nav.width > 0 && nav.height > 0,
        overlaps:
          nav.left < pdf.right &&
          pdf.left < nav.right &&
          nav.top < pdf.bottom &&
          pdf.top < nav.bottom,
      };
    });
    assert.equal(
      layout?.visible,
      true,
      `month controls are visible at ${width}px`,
    );
    assert.equal(
      layout?.overlaps,
      false,
      `month controls do not overlap PDF export at ${width}px`,
    );
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(
    await picker.isVisible(),
    true,
    "month selector is available on desktop",
  );
  assert.equal(await previous.isVisible(), true);
  assert.equal(await next.isVisible(), true);
  assert.equal(
    await picker.evaluate(
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
  "Report month selector browser checks passed for arrow and select navigation, keyboard activation, month bounds, export behavior, spacing, and responsive overflow.",
);
