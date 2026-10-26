#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const scriptsDir = path.join(root, "scripts");
const aliasLoader = path.join(scriptsDir, "test-release-regression-alias-loader.mjs");

// Explicitly offline/source-level tests only. Live/browser/database tests are
// deliberately excluded and must be run in separately isolated environments.
// The receipt-loader script imports Next server-only modules and is kept out of
// this direct Node runner; receipt loading/cookie acceptance remains a separate
// Next-hosted check, while the client PNG and success-page contracts run here.
const suites = [
  ["Fresh Pick assignment/readiness", "test-fresh-pick-assignment-readiness-contract.ts"],
  ["Fresh Pick readiness presentation", "test-bakery-fresh-pick-readiness.ts"],
  ["Fresh Pick readiness cutoff", "test-extra-ready-for-collection.ts"],
  ["Fresh Pick complimentary/calendar/messages", "test-fresh-pick-complimentary-regressions.ts"],
  ["Bakery board eligibility", "test-m5-p1-bakery-board-eligibility.ts"],
  ["Bakery capability UX", "test-m5-p1-bakery-capabilities-ux.ts"],
  ["Collection eligibility and unpaid handoff", "test-collection-eligibility.ts"],
  ["Collection Ready/Thank You templates", "test-collection-ready-message.ts"],
  ["Collection capability UX", "test-collection-capabilities-ux.ts"],
  ["Collection Dine-in desk", "test-collection-dine-in-desk.ts"],
  ["Collection pickup role guards", "test-collection-picked-up-rpc-roles.ts"],
  ["Calendar fulfilment and markers", "test-m4-p2-slice5-calendar-fulfilment.ts"],
  ["Calendar message parity", "test-manager-calendar-messages-parity.ts"],
  ["Fresh Pick Calendar assignment", "test-extra-calendar-assign.ts"],
  ["Fresh Pick phase 6", "test-extra-phase6-fresh-picks.ts"],
  ["Fresh Pick eligibility", "test-extra-fresh-picks-eligibility.ts"],
  ["Fresh Pick cart", "test-fresh-pick-cart.ts"],
  ["Fresh Pick product-detail venue", "test-fresh-pick-product-detail-venue.ts"],
  ["Fresh Pick preparation cutoff", "test-fresh-picks-same-day-preparation.ts"],
  ["Dine-in reservation/serving window", "test-dine-in-reservation-serving-window.ts"],
  ["Whole-cake customer fulfilment", "test-whole-cake-customer-fulfilment.ts"],
  ["Delivery receipt clarity", "test-delivery-receipt-clarity.ts"],
  ["Saved order PNG and save recovery", "test-save-order-details.ts"],
  ["Complimentary and paid-add-on options", "test-customer-preorder-options.ts"],
  ["Customer message templates", "test-customer-message-templates.cjs"],
  ["Customer message counter instructions", "test-customer-message-counter-instructions.cjs"],
  ["Catalogue voucher engine", "test-catalogue-voucher-engine.ts"],
  ["Catalogue voucher redemption", "test-catalogue-voucher-redemption.ts"],
  ["Voucher RM10 rules", "test-voucher-library-rm10.ts"],
  ["Waiting-list workflow", "test-waiting-list.ts"],
  ["Waiting-list link/token state", "test-waiting-list-confirmation-link.ts"],
  ["Waiting-list review", "test-waiting-list-confirmation-review.ts"],
  ["Waiting-list conversion", "test-waiting-list-confirmation-convert.ts"],
  ["Waiting-list customer confirmation", "test-waiting-list-customer-confirmation.ts"],
  ["Waiting-list conversion state", "test-waiting-list-confirmation-conversion-state.ts"],
  ["Waiting-list closed date", "test-waiting-list-confirmation-closed-date.ts"],
  ["Staff passkeys", "test-staff-passkeys.ts"],
  ["Staff credentials", "test-staff-credentials.ts"],
  ["Staff administration", "test-staff-admin.ts"],
  ["Staff password reset", "test-staff-password-reset.ts"],
  ["Payment details", "test-payment-details.ts"],
  ["Payment write lock", "test-payment-write-lock.ts"],
  ["Payment correction", "test-payment-correction.ts"],
  ["Payment record correction", "test-payment-record-correction.ts"],
  ["Guest-order cancellation safeguards", "test-cancel-guest-order.ts"],
  ["Share Payment messaging", "test-share-payment-message-with-qr.ts"],
  ["Bakery early-pickup attention", "test-bakery-early-pickup-attention.ts"],
  ["Collection delivery detail", "test-collection-delivery-detail.ts"],
  ["Collection pickup overdue", "test-collection-pickup-overdue.ts"],
  ["Waiting-list staff notification content", "test-waiting-list-staff-notification.ts"],
  ["New-order notification content", "test-staff-notification-new-order-content.ts", ["--source-only"]],
  ["Fresh Pick receipt complimentary persistence contract", "test-guest-extra-receipt-complimentary.ts"],
  ["Storefront success receipt loading", "test-storefront-success-loading.ts"],
];

let failed = 0;
let blocked = 0;
let passed = 0;
function run(label, command, args, timeout = 120_000, envOverrides = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "pipe",
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout,
    // Deliberately do not inherit Supabase, email, payment or dispatch secrets.
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? "/tmp",
      USER: process.env.USER ?? "",
      LOGNAME: process.env.LOGNAME ?? "",
      LANG: process.env.LANG ?? "C",
      TMPDIR: process.env.TMPDIR ?? "/tmp",
      CI: "1",
      NODE_NO_WARNINGS: "1",
      ...envOverrides,
    },
  });
  if (result.error) {
    const isTimeout = result.error.code === "ETIMEDOUT";
    console.error(`${isTimeout ? "BLOCKED" : "FAIL"} ${label}: ${result.error.message}`);
    if (result.stdout) console.error(result.stdout.slice(-4000));
    if (result.stderr) console.error(result.stderr.slice(-4000));
    if (isTimeout) blocked++;
    else failed++;
  } else if (result.status !== 0) {
    const details = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const isSandboxBlock = /Operation not permitted|not allowed to create shared memory/i.test(details);
    console.error(`${isSandboxBlock ? "BLOCKED" : "FAIL"} ${label}: exit ${result.status ?? "signal"}`);
    if (result.stdout) console.error(result.stdout.slice(-4000));
    if (result.stderr) console.error(result.stderr.slice(-4000));
    if (isSandboxBlock) blocked++;
    else failed++;
  } else {
    passed++;
    const output = result.stdout ?? "";
    const liveSkipped = /SKIP live/i.test(output);
    const lastLine = output.trim().split("\n").at(-1);
    console.log(`${label}: PASS${liveSkipped ? " (source; hosted skipped by isolated env)" : ""}${lastLine && !liveSkipped ? ` — ${lastLine.trim()}` : ""}`);
  }
}

for (const [label, file, extraArgs = []] of suites) {
  const testPath = path.join(scriptsDir, file);
  if (!existsSync(testPath)) {
    console.error(`MISSING: ${testPath}`);
    failed++;
    continue;
  }
  const isTypeScript = file.endsWith(".ts");
  run(label, process.execPath, isTypeScript
    ? ["--import", aliasLoader, testPath, ...extraArgs]
    : [testPath, ...extraArgs]);
}

// Isolated SQL regression for the actual assignment RPC. It creates a private
// loopback-free PostgreSQL cluster and removes only its own temporary directory.
const postgresContainerId = process.env.RELEASE_TEST_POSTGRES_CONTAINER_ID;
const postgresHarnessEnv = postgresContainerId
  ? { RELEASE_TEST_POSTGRES_CONTAINER_ID: postgresContainerId }
  : {};

run("Disposable PostgreSQL Fresh Pick assignment RPC", "bash", [
  path.join(scriptsDir, "test-extra-assignment-rpc-postgres.sh"),
  ], 90_000, postgresHarnessEnv);

const tsc = path.join(root, "node_modules", ".bin", "tsc");
run("Application TypeScript", tsc, ["--noEmit"], 60_000);
run("Release regression test TypeScript", tsc, ["--noEmit", "-p", "tsconfig.release-regressions.json"], 60_000);

const eslint = path.join(root, "node_modules", ".bin", "eslint");
run("Changed regression-test lint", eslint, [
  "scripts/test-extra-calendar-assign.ts",
  "scripts/test-extra-fresh-picks-eligibility.ts",
  "scripts/test-staff-notification-new-order-content.ts",
  "scripts/test-fresh-pick-assignment-readiness-contract.ts",
  "scripts/test-release-regressions.mjs",
  "scripts/test-release-regression-alias-loader.mjs",
], 60_000);

run("Tracked diff hygiene", "git", ["diff", "--check", "HEAD"]);
console.log(`\nOffline checks: ${passed} PASS, ${failed} FAIL, ${blocked} BLOCKED.`);
console.log("Hosted Production/DEV integration is NOT RUN by this offline gate; hosted acceptance remains a separate release gate.");
if (failed) {
  console.error(`\nRelease regression gate: FAIL (${failed} failed, ${blocked} blocked checks)`);
  process.exit(1);
}
if (blocked) {
  console.error(`\nRelease regression gate: BLOCKED (${blocked} checks could not complete in this execution environment)`);
  process.exit(2);
}
console.log("\nRelease regression gate: PASS (source/local checks only; hosted checks remain separate)");
