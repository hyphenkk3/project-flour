import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helperPath = path.join(
  repo,
  "src/workspaces/storefront/catalog/storefront-read-resilience.ts",
);
const helperSource = fs.readFileSync(helperPath, "utf8");
const helperJavaScript = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const helperModule = { exports: {} };
new Function("exports", "module", helperJavaScript)(
  helperModule.exports,
  helperModule,
);
const {
  classifyStorefrontReadFailure,
  settleStorefrontRead,
  storefrontReadFailureMessage,
} = helperModule.exports;

async function run() {
  const empty = await settleStorefrontRead(async () => []);
  assert.deepEqual(empty, { ok: true, value: [] });

  const timeout = Object.assign(
    new Error("canceling statement due to statement timeout"),
    {
      code: "57014",
    },
  );
  const rejected = await settleStorefrontRead(async () => {
    throw timeout;
  });
  assert.deepEqual(rejected, { ok: false, error: timeout });
  assert.equal(classifyStorefrontReadFailure(timeout), "timeout");
  assert.match(
    storefrontReadFailureMessage(timeout, "November cake collection"),
    /timed out/i,
  );
  assert.match(
    storefrontReadFailureMessage(timeout, "November cake collection"),
    /not treated this as an empty result/i,
  );
  assert.equal(
    classifyStorefrontReadFailure(new Error("fetch failed: ECONNRESET")),
    "network",
  );
  assert.equal(
    classifyStorefrontReadFailure(
      Object.assign(new Error("PostgREST request failed"), {
        code: "PGRST000",
      }),
    ),
    "database",
  );
  assert.equal(classifyStorefrontReadFailure(new Error()), "unknown");

  let attempts = 0;
  const firstAttempt = await settleStorefrontRead(async () => {
    attempts += 1;
    throw new Error("database unavailable");
  });
  assert.equal(firstAttempt.ok, false);
  assert.equal(
    attempts,
    1,
    "a failed request does not trigger an automatic retry",
  );
  const retry = await settleStorefrontRead(async () => {
    attempts += 1;
    return ["live result"];
  });
  assert.deepEqual(retry, { ok: true, value: ["live result"] });
  assert.equal(attempts, 2, "a separate retry performs one new read");

  const partial = await Promise.all([
    settleStorefrontRead(async () => {
      throw new Error("collection timeout");
    }),
    settleStorefrontRead(async () => ["popular cake"]),
  ]);
  assert.equal(partial[0].ok, false);
  assert.deepEqual(partial[1], { ok: true, value: ["popular cake"] });

  const retryNotice = fs.readFileSync(
    path.join(repo, "src/workspaces/storefront/StorefrontRetryNotice.tsx"),
    "utf8",
  );
  assert.match(retryNotice, /router\.refresh\(\)/);
  assert.match(retryNotice, /disabled=\{retryPending\}/);
  assert.match(retryNotice, /refreshPending/);
  assert.match(retryNotice, /publishRefreshPending\(true\)/);
  assert.match(retryNotice, /Trying again/);
  assert.doesNotMatch(retryNotice, /setInterval|setTimeout\(/);

  const collectionPage = fs.readFileSync(
    path.join(
      repo,
      "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
    ),
    "utf8",
  );
  assert.match(
    collectionPage,
    /cakesResult\.ok \? \([\s\S]*?<BrowseCakeCatalogue/,
  );
  assert.match(
    collectionPage,
    /Cakes in this collection are temporarily unavailable/,
  );
  assert.match(
    collectionPage,
    /emptyMessage="No cakes are listed in this collection yet\."/,
  );
  assert.match(collectionPage, /if \(!monthlyResult\.ok\)/);
  assert.match(collectionPage, /if \(!specialCandidateResult\.ok\)/);

  const homePage = fs.readFileSync(
    path.join(repo, "src/workspaces/storefront/home/StorefrontHomePage.tsx"),
    "utf8",
  );
  assert.match(
    homePage,
    /settleStorefrontRead\(\(\) => listHomepagePopularCakes\(\)\)/,
  );
  assert.match(homePage, /popularResult\.ok \? \(/);
  assert.match(homePage, /featuredResults\.map\(\(result\) =>/);

  const voucherQueries = fs.readFileSync(
    path.join(repo, "src/workspaces/vouchers/catalogue-queries.ts"),
    "utf8",
  );
  assert.match(voucherQueries, /listPublicCatalogueVouchersStrict/);
  assert.match(voucherQueries, /if \(error\) throw new Error\(error\.message\)/);

  console.log(
    "PASS: 28 catalogue resilience assertions; no automatic retry loop.",
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
