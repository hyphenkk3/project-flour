/**
 * Browser regression test for + Record Payment auto-scroll.
 * Bundles the real PaymentSection and RecordPaymentForm, mocking only router,
 * server actions, and unrelated child panels. The test measures real viewport
 * movement at phone and desktop widths.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import path from "node:path";

const require = createRequire(import.meta.url);
const esbuild = require("/Users/ycwee/.npm/_npx/95c8da6ffd4052b6/node_modules/esbuild");
const {
  chromium,
} = require("/Users/ycwee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = process.cwd();

const virtualModules = {
  "next/link": `import React from "react"; export default function Link({href,children,...props}) { return React.createElement("a", {href, ...props}, children); }`,
  "next/navigation": `export function useRouter() { return { refresh() {} }; }`,
  "@/workspaces/owner/orders/actions": `export async function extendPaymentDeadlineAction() { return {error:null,success:false}; } export async function recordAndVerifyPaymentAction() { return {error:null,success:false}; }`,
  "@/workspaces/owner/orders/RecordRefundForm": `export function RecordRefundForm() { return null; }`,
  "@/workspaces/owner/orders/RecordPaymentCorrectionForm": `export function RecordPaymentCorrectionForm() { return null; }`,
  "@/workspaces/owner/orders/OrderDiscountsPanel": `export function OrderDiscountsPanel() { return null; }`,
  "@/workspaces/owner/orders/DeliveryFinanceBreakdown": `export function DeliveryFinanceBreakdown() { return null; }`,
};

const entry = `
import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {PaymentSection} from "@/workspaces/owner/orders/PaymentSection";
const baseOrder = {
  id: "local-browser-regression",
  phone: "6596230653",
  status: "awaiting_payment",
  paymentDeadlineAt: null,
  paymentRequestSentAt: null,
  items: [],
  paidAddons: [],
  refunds: [],
  paymentAllocations: [],
  settlement: {amountDue:100, verifiedPaymentsAllocated:0, remainingBalance:100, overpayment:0, refundsTotal:0},
};
function Harness() {
  const [revision, setRevision] = useState(0);
  window.bumpUnrelatedPaymentInfo = () => setRevision((value) => value + 1);
  return <>
    <header className="sticky top-0" data-test-sticky-header>Sticky app header</header>
    <div aria-hidden="true" style={{height: 340}} />
    <div id="payment-section"><PaymentSection order={{...baseOrder, phone: revision ? "447911123456" : baseOrder.phone}} canRecordPayment /></div>
    <div aria-hidden="true" style={{height: 1800}} />
  </>;
}
createRoot(document.getElementById("root")).render(<Harness />);
`;

const build = await esbuild.build({
  stdin: {
    contents: entry,
    resolveDir: root,
    sourcefile: "payment-scroll-regression.tsx",
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
        build.onResolve({ filter: /.*/ }, (args) => {
          if (Object.hasOwn(virtualModules, args.path))
            return { path: args.path, namespace: "test-boundary" };
          return undefined;
        });
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

const server = createServer((req, res) => {
  if (req.url === "/bundle.js") {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(bundle);
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html{scroll-behavior:auto}body{margin:0;font:16px system-ui}header{position:sticky;top:0;height:64px;z-index:5;background:#fff;border-bottom:1px solid #ccc}#payment-section form{min-height:900px}#payment-section section{padding:12px}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

try {
  for (const scenario of [
    {
      name: "iPhone-sized viewport with reduced motion",
      width: 390,
      height: 700,
      reducedMotion: "reduce",
      expectedBehavior: "auto",
      shouldScroll: true,
    },
    {
      name: "desktop viewport with normal motion",
      width: 1280,
      height: 800,
      reducedMotion: "no-preference",
      expectedBehavior: "smooth",
      shouldScroll: true,
    },
    {
      name: "tall viewport keeps the form in place",
      width: 390,
      height: 2000,
      reducedMotion: "reduce",
      expectedBehavior: null,
      shouldScroll: false,
    },
  ]) {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      reducedMotion: scenario.reducedMotion,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const original = window.scrollTo.bind(window);
      window.__scrollBehaviors = [];
      window.scrollTo = (options, y) => {
        const behavior =
          typeof options === "object" ? options.behavior : undefined;
        window.__scrollBehaviors.push(behavior ?? "auto");
        if (typeof options === "object") original(options);
        else original(options, y);
      };
    });
    await page.goto(baseUrl);
    const button = page.getByRole("button", { name: "+ Record Payment" });
    await button.waitFor({ state: "visible" });
    await page.evaluate(() => {
      const target = document.querySelector("#payment-section button");
      const rect = target.getBoundingClientRect();
      const desiredTop = window.innerHeight - 80;
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - desiredTop),
        behavior: "auto",
      });
      window.__scrollBehaviors = [];
    });
    const before = await page.evaluate(() => window.scrollY);
    await button.click();
    await page.locator("#payment-section form").waitFor({ state: "visible" });
    await page.waitForTimeout(
      scenario.expectedBehavior === "smooth" ? 900 : 100,
    );

    const opened = await page.evaluate(() => {
      const form = document.querySelector("#payment-section form");
      const header = document.querySelector("header");
      const button = [...document.querySelectorAll("button")].find((item) =>
        item.textContent?.includes("Record Payment"),
      );
      return {
        scrollY: window.scrollY,
        formTop: form.getBoundingClientRect().top,
        headerBottom: header.getBoundingClientRect().bottom,
        activeButton: document.activeElement === button,
        behavior: window.__scrollBehaviors.at(-1),
      };
    });
    if (scenario.shouldScroll) {
      assert.ok(
        opened.scrollY > before + 25,
        `${scenario.name}: expected actual viewport movement (before=${before}, after=${opened.scrollY})`,
      );
      assert.ok(
        opened.formTop >= opened.headerBottom,
        `${scenario.name}: form should be below sticky header`,
      );
      assert.ok(
        opened.formTop <= opened.headerBottom + 24,
        `${scenario.name}: scroll should not be excessive`,
      );
      assert.equal(
        opened.behavior,
        scenario.expectedBehavior,
        `${scenario.name}: respect reduced motion preference`,
      );
    } else {
      assert.ok(
        Math.abs(opened.scrollY - before) <= 2,
        `${scenario.name}: no scroll is needed when the expanded form fits`,
      );
      assert.equal(
        opened.behavior,
        undefined,
        `${scenario.name}: avoid unnecessary scroll calls`,
      );
    }
    assert.equal(
      opened.activeButton,
      true,
      `${scenario.name}: scrolling must not disrupt trigger focus`,
    );

    await page.evaluate(() => window.bumpUnrelatedPaymentInfo());
    await page.waitForTimeout(80);
    const afterUnrelatedUpdate = await page.evaluate(() => window.scrollY);
    assert.ok(
      Math.abs(afterUnrelatedUpdate - opened.scrollY) <= 2,
      `${scenario.name}: unrelated rerender must not scroll again`,
    );

    const beforeClose = await page.evaluate(() => window.scrollY);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.locator("#payment-section form").waitFor({ state: "detached" });
    await page.waitForTimeout(80);
    const afterClose = await page.evaluate(() => window.scrollY);
    assert.ok(
      Math.abs(afterClose - beforeClose) <= 2,
      `${scenario.name}: closing the form must not jump the viewport`,
    );
    console.log(
      `PASS ${scenario.name}: scroll, header clearance, focus, update, and close behavior`,
    );
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
