/** Browser regression for the PaymentSection correction and refund controls. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const esbuild = require("/Users/ycwee/.npm/_npx/95c8da6ffd4052b6/node_modules/esbuild");
const { chromium } = require("/Users/ycwee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = process.cwd();
const virtualModules = {
  "next/link": `import React from "react"; export default function Link({href, children, ...props}) { return React.createElement("a", {href, ...props}, children); }`,
  "next/navigation": `export function useRouter() { return { refresh() {} }; }`,
  "@/workspaces/owner/orders/actions": `export async function extendPaymentDeadlineAction() { return {error:null,success:false}; } export async function recordAndVerifyPaymentAction() { return {error:null,success:false}; } export async function correctPaymentRecordAction() { return {error:null,success:false}; }`,
  "@/workspaces/owner/orders/RecordRefundForm": `import React from "react"; export function RecordRefundForm({kind}) { return <form aria-label={kind === "overpayment" ? "Overpayment refund form" : "General refund form"}><p>Refund fields</p></form>; }`,
  "@/workspaces/owner/orders/OrderDiscountsPanel": `export function OrderDiscountsPanel() { return null; }`,
  "@/workspaces/owner/orders/DeliveryFinanceBreakdown": `export function DeliveryFinanceBreakdown() { return null; }`,
};

const entry = `
import React from "react";
import {createRoot} from "react-dom/client";
import {flushSync} from "react-dom";
import {PaymentSection} from "@/workspaces/owner/orders/PaymentSection";
const allocation = {id:"allocation-1", amount:135, method:"online_transfer", methodDescription:null, paidAt:"2026-10-16T00:00:00Z", allocationCount:1, correction:null};
const order = {
  id:"synthetic-ui-only", phone:"", status:"paid", paymentDeadlineAt:null,
  paymentRequestSentAt:null, items:[], paidAddons:[], refunds:[],
  paymentAllocations:[allocation],
  settlement:{amountDue:135, verifiedPaymentsAllocated:135, netReceived:135,
    remainingBalance:0, remainingRefundable:135, overpayment:0, refundsTotal:0},
};
const root = createRoot(document.getElementById("root"));
window.renderScenario = (scenario) => {
  const nextAllocation = {...allocation};
  const nextOrder = {...order, settlement:{...order.settlement}, paymentAllocations:[nextAllocation]};
  if (scenario === "overpayment") {
    nextAllocation.amount = 140;
    nextOrder.settlement.overpayment = 5;
    nextOrder.settlement.verifiedPaymentsAllocated = 140;
    nextOrder.settlement.netReceived = 140;
  }
  if (scenario === "refunded") nextOrder.refunds = [{id:"refund-1", amount:5, refundedAt:"2026-10-16T00:00:00Z", createdAt:"2026-10-16T00:00:00Z"}];
  if (scenario === "shared") nextAllocation.allocationCount = 2;
  if (scenario === "corrected") nextAllocation.correction = {id:"correction-1", originalAmount:135, correctedAmount:135, originalMethod:"online_transfer", correctedMethod:"wb_qr", reason:"Test", correctedAt:"2026-10-16T00:00:00Z"};
  if (scenario === "completed") nextOrder.status = "completed";
  flushSync(() => root.render(<PaymentSection key={scenario} order={nextOrder} canRecordPaymentCorrection={scenario !== "unauthorized"} />));
};
`;
const build = await esbuild.build({
  stdin: { contents: entry, resolveDir: root, sourcefile: "payment-correction-visibility.tsx", loader: "tsx" },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  tsconfig: path.join(root, "tsconfig.json"),
  plugins: [{
    name: "test-boundaries",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) =>
        Object.hasOwn(virtualModules, args.path)
          ? { path: args.path, namespace: "test-boundary" }
          : undefined,
      );
      build.onLoad({ filter: /.*/, namespace: "test-boundary" }, (args) => ({
        contents: virtualModules[args.path], loader: "tsx", resolveDir: root,
      }));
    },
  }],
});

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage();
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: build.outputFiles[0].text });
  const correction = page.getByRole("button", { name: "Correct Payment" });
  const correctionForm = page.getByRole("heading", { name: "Correct Payment" });

  await page.evaluate(() => window.renderScenario("paid"));
  await correction.click();
  assert.equal(await correctionForm.isVisible(), true, "paid order without overpayment opens correction form");
  assert.equal(await page.getByLabel("Correct amount").isVisible(), true);
  assert.equal(await page.getByRole("button", { name: "Refund Overpayment" }).count(), 0);

  await page.evaluate(() => window.renderScenario("overpayment"));
  await correction.click();
  assert.equal(await correctionForm.isVisible(), true, "overpayment still allows correction");
  await page.getByRole("button", { name: "Refund Overpayment" }).click();
  assert.equal(await correctionForm.count(), 0, "refund control closes correction form");
  assert.equal(await page.getByRole("form", { name: "Overpayment refund form" }).isVisible(), true);
  await correction.click();
  assert.equal(await correctionForm.isVisible(), true, "correction control remains independently accessible");
  assert.equal(await page.getByRole("form", { name: "Overpayment refund form" }).count(), 0);

  for (const scenario of ["unauthorized", "refunded", "shared", "corrected", "completed"]) {
    await page.evaluate((name) => window.renderScenario(name), scenario);
    assert.equal(await correction.count(), 0, `${scenario}: correction is not offered`);
    assert.equal(await correctionForm.count(), 0, `${scenario}: correction form is not rendered`);
  }
  await page.close();
  console.log("test-payment-correction-visibility-browser: ok");
} finally {
  await browser?.close();
}
