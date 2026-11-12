/** Same-origin browser race regression for staff Web notification claims. */
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

const bundle = await esbuild.build({
  stdin: {
    contents: `
      import { tryClaimStaffNotification, claimStaffNotificationForStaff } from "./src/foundation/staff/staff-notification-engine";
      import { loadStaffNotificationRecoveryCursor, saveStaffNotificationRecoveryCursor } from "./src/foundation/staff/staff-notification-recovery";
      window.legacyClaim = tryClaimStaffNotification;
      window.staffClaim = (staff, event, present = () => {}) => claimStaffNotificationForStaff(staff, event, present);
      window.loadCursor = loadStaffNotificationRecoveryCursor;
      window.saveCursor = saveStaffNotificationRecoveryCursor;
    `,
    resolveDir: root,
    sourcefile: "staff-notification-claim-test.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  tsconfig: path.join(root, "tsconfig.json"),
});

const server = createServer((request, response) => {
  if (request.url === "/claim.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(bundle.outputFiles[0].text);
    return;
  }
  response.writeHead(200, { "content-type": "text/html" });
  response.end(
    "<!doctype html><html><body><script src='/claim.js'></script></body></html>",
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
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  await Promise.all([first.goto(baseUrl), second.goto(baseUrl)]);

  // Reproduce the previous BroadcastChannel-only race in two independent
  // same-origin pages: both synchronous claims win before either message lands.
  const [legacyFirst, legacySecond] = await Promise.all([
    first.evaluate(() => window.legacyClaim("race-event")),
    second.evaluate(() => window.legacyClaim("race-event")),
  ]);
  assert.deepEqual([legacyFirst, legacySecond], [true, true]);

  // New claim path uses Web Locks + a staff-scoped persistent event claim.
  const isolated = await browser.newContext();
  const left = await isolated.newPage();
  const right = await isolated.newPage();
  await Promise.all([left.goto(baseUrl), right.goto(baseUrl)]);
  const [leftResult, rightResult] = await Promise.all([
    left.evaluate(() =>
      window.staffClaim(
        "staff-a",
        "event-a",
        () => (window.presented = (window.presented ?? 0) + 1),
      ),
    ),
    right.evaluate(() =>
      window.staffClaim(
        "staff-a",
        "event-a",
        () => (window.presented = (window.presented ?? 0) + 1),
      ),
    ),
  ]);
  assert.equal(
    [leftResult, rightResult].filter((result) => result.claimed).length,
    1,
  );
  assert.ok(
    [leftResult, rightResult].every((result) => result.crossTabProtected),
  );
  assert.equal(
    (await left.evaluate(() => window.presented ?? 0)) +
      (await right.evaluate(() => window.presented ?? 0)),
    1,
    "same-staff event is presented by only the winning tab",
  );

  const otherStaff = await right.evaluate(() =>
    window.staffClaim(
      "staff-b",
      "event-a",
      () => (window.presented = (window.presented ?? 0) + 1),
    ),
  );
  assert.equal(
    otherStaff.claimed,
    true,
    "claim scope is independent per staff member",
  );
  await left.reload();
  const afterRefresh = await left.evaluate(() =>
    window.staffClaim(
      "staff-a",
      "event-a",
      () => (window.presented = (window.presented ?? 0) + 1),
    ),
  );
  assert.equal(afterRefresh.claimed, false, "claim persists across tab reload");

  const expectedCursor = {
    createdAt: "2026-11-12T04:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000001",
  };
  assert.equal(
    await left.evaluate(
      (cursor) => window.saveCursor("staff-a", cursor),
      expectedCursor,
    ),
    true,
  );
  await left.reload();
  assert.deepEqual(
    await left.evaluate(() => window.loadCursor("staff-a")),
    expectedCursor,
    "recovery cursor persists across page refresh",
  );

  // Model iOS Safari releases without Web Locks. IndexedDB transactions
  // provide the same same-origin, same-staff atomic claim.
  const fallbackContext = await browser.newContext();
  await fallbackContext.addInitScript(() => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });
  });
  const fallbackLeft = await fallbackContext.newPage();
  const fallbackRight = await fallbackContext.newPage();
  await Promise.all([fallbackLeft.goto(baseUrl), fallbackRight.goto(baseUrl)]);
  const [fallbackA, fallbackB] = await Promise.all([
    fallbackLeft.evaluate(() =>
      window.staffClaim(
        "staff-c",
        "event-c",
        () => (window.presented = (window.presented ?? 0) + 1),
      ),
    ),
    fallbackRight.evaluate(() =>
      window.staffClaim(
        "staff-c",
        "event-c",
        () => (window.presented = (window.presented ?? 0) + 1),
      ),
    ),
  ]);
  assert.equal(
    [fallbackA, fallbackB].filter((result) => result.claimed).length,
    1,
  );
  assert.equal(
    (await fallbackLeft.evaluate(() => window.presented ?? 0)) +
      (await fallbackRight.evaluate(() => window.presented ?? 0)),
    1,
    "IndexedDB fallback presents a same-staff event once across tabs",
  );
  const fallbackOtherStaff = await fallbackRight.evaluate(() =>
    window.staffClaim(
      "staff-d",
      "event-c",
      () => (window.presented = (window.presented ?? 0) + 1),
    ),
  );
  assert.equal(fallbackOtherStaff.claimed, true);
  const failedPresentation = await fallbackLeft.evaluate(() =>
    window.staffClaim("staff-c", "event-failure", () => {
      throw new Error("test");
    }),
  );
  assert.equal(failedPresentation.claimed, false);
  assert.equal(failedPresentation.presentationFailed, true);
  const retriedPresentation = await fallbackRight.evaluate(() =>
    window.staffClaim(
      "staff-c",
      "event-failure",
      () => (window.presented = (window.presented ?? 0) + 1),
    ),
  );
  assert.equal(
    retriedPresentation.claimed,
    true,
    "failed presentation remains retryable",
  );

  const limitedContext = await browser.newContext();
  await limitedContext.addInitScript(() => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined,
    });
  });
  const limitedPage = await limitedContext.newPage();
  await limitedPage.goto(baseUrl);
  const limitedResult = await limitedPage.evaluate(() =>
    window.staffClaim("staff-e", "event-e", () => (window.presented = 1)),
  );
  assert.equal(limitedResult.claimed, true);
  assert.equal(limitedResult.crossTabProtected, false);
  const samePageDuplicate = await limitedPage.evaluate(() =>
    window.staffClaim("staff-e", "event-e", () => (window.presented = 2)),
  );
  assert.equal(samePageDuplicate.claimed, false);
  assert.equal(
    await limitedPage.evaluate(() => window.presented),
    1,
    "least-capable fallback still deduplicates within one tab and reports degraded protection",
  );
  await left.evaluate(() =>
    localStorage.setItem(
      "wos-staff-notification-cursor:staff-a",
      "malformed-json",
    ),
  );
  assert.equal(
    await left.evaluate(
      (cursor) => window.saveCursor("staff-a", cursor),
      expectedCursor,
    ),
    true,
    "malformed stored cursor can be safely replaced",
  );
  assert.deepEqual(
    await left.evaluate(() => window.loadCursor("staff-a")),
    expectedCursor,
  );

  console.log(
    "PASS same-origin cross-tab claim: legacy BroadcastChannel race reproduced; Web Locks and IndexedDB fallback each present once, remain staff-scoped, persist across reload, and allow retry after presentation failure",
  );
  await context.close();
  await isolated.close();
  await fallbackContext.close();
  await limitedContext.close();
} finally {
  await browser.close();
  server.close();
}
