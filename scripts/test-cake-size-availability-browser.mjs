/** Local browser tests; never loads .env. Requires the scratch DB test first.
 * Run: node scripts/test-cake-size-availability-browser.mjs
 * Production components, fixture service adapter, actual Server Action code + actual local PostgreSQL pricing.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const esbuild = require("/Users/ycwee/.npm/_npx/95c8da6ffd4052b6/node_modules/esbuild");
const {
  chromium,
} = require("/Users/ycwee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = process.cwd();
const cakeId = "10000000-0000-0000-0000-000000000001";
const fourId = "20000000-0000-0000-0000-000000000004";
const sixId = "20000000-0000-0000-0000-000000000006";
const image = (text) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#eee"/><text x="50" y="150">${text}</text></svg>`)}`;
const photos = [
  {
    id: "default",
    url: image("Cake"),
    altText: "Default Cake",
    sortOrder: 0,
    cakeSizeId: null,
    isDefault: true,
  },
  {
    id: "four",
    url: image("4 inch"),
    altText: "4 inch Cake",
    sortOrder: 1,
    cakeSizeId: fourId,
    isDefault: false,
  },
  {
    id: "six",
    url: image("6 inch"),
    altText: "6 inch Cake",
    sortOrder: 2,
    cakeSizeId: sixId,
    isDefault: false,
  },
];
function sql(query) {
  return execFileSync(
    "/opt/homebrew/bin/psql",
    [
      "-X",
      "-h",
      "/private/tmp/flour-size-availability-pg-socket",
      "-p",
      "55439",
      "-U",
      "ycwee",
      "-d",
      "flour_size_availability_test",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      query,
    ],
    { encoding: "utf8" },
  ).trim();
}
function liveCake() {
  const sizes = JSON.parse(
    sql(
      `select json_agg(json_build_object('id',id,'cakeId',cake_id,'size',label,'price',price,'sortOrder',0,'preorderDays',preorder_days,'availableFrom',available_from,'availableUntil',available_until) order by label) from library_cake_sizes where cake_id='${cakeId}'`,
    ),
  );
  return {
    id: cakeId,
    name: "Thai Milk Tea Mango",
    description: null,
    sharingGuide: null,
    allergens: [],
    image: photos[0].url,
    photos,
    sizes,
  };
}
function loadModule(file, dependencies = {}) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected import ${name}`);
    },
    Intl,
    Date,
  });
  return exports;
}
const engine = loadModule("src/engines/menu/cake-size-availability.ts");
const actions = loadModule("src/workspaces/storefront/cart/actions.ts", {
  "@/engines/menu/cake-size-availability": engine,
  "@/workspaces/storefront/catalog/queries": {
    listStorefrontCakesByIds: async (ids) =>
      ids.includes(cakeId) ? [liveCake()] : [],
  },
});
const mocks = {
  "@/workspaces/storefront/catalog/StorefrontCakeDetailLink": `import React from 'react';export function StorefrontCakeDetailLink({cakeName,imageSrc,...props}){return <a {...props}/>}`,
  "next/image": `import React from 'react';export default function Image({fill,priority,...props}) {return <img {...props}/>}`,
  "next/link": `import React from 'react';export default function Link(props) {return <a {...props}/>}`,
  "next/navigation": `export function usePathname(){return '/cakes/fixture'}`,
  "@/workspaces/storefront/catalog/storefront-cake-paint-hint": `export function markStorefrontCakeDetailPaintReady(){}`,
  "@/workspaces/library/cakes/CakeSizePriceSchedule": `export function CakeSizePriceSchedule(){return null}`,
  "@/workspaces/storefront/cart/actions": `export async function validateCartSizeAvailability(items,pickupDate){return fetch('/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items,pickupDate})}).then(r=>r.json())}export async function loadCartEditCakes(){return fetch('/cakes').then(r=>r.json())}`,
  "@/workspaces/storefront/checkout/actions": `export async function resolveCheckoutCakeSizePrices(date,sizeIds){return fetch('/prices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,sizeIds})}).then(r=>r.json())}`,
  "@/workspaces/storefront/offers/CakeOfferCard": `export function CakeOfferCard(){return null}`,
  "@/workspaces/storefront/offers/CatalogueVoucherCartPanel": `export function CatalogueVoucherCartPanel(){return null}`,
  "@/workspaces/storefront/offers/CatalogueVoucherCartTotals": `export function CatalogueVoucherCartTotals(){return null}`,
  "@/workspaces/storefront/offers/CatalogueVoucherAmountLines": `export function CatalogueVoucherAmountLines(){return null}export function catalogueVoucherPreviewPayable(total){return total}`,
};
const bundle = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["scripts/fixtures/cake-size-availability-browser.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  plugins: [
    {
      name: "local-fixture-services",
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) =>
          args.path in mocks
            ? { path: args.path, namespace: "fixture" }
            : undefined,
        );
        build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents: mocks[args.path],
          loader: "tsx",
          resolveDir: root,
        }));
      },
    },
  ],
});
const initialCake = liveCake();
let delayValidation = false;
const server = createServer(async (req, res) => {
  try {
    let body = "";
    for await (const chunk of req) body += chunk;
    let result;
    if (req.url === "/app.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(bundle.outputFiles[0].text);
      return;
    }
    if (req.url === "/cakes") result = [liveCake()];
    else if (req.url === "/validate") {
      const data = JSON.parse(body);
      if (delayValidation)
        await new Promise((resolve) => setTimeout(resolve, 300));
      result = await actions.validateCartSizeAvailability(
        data.items,
        data.pickupDate,
      );
    } else if (req.url === "/prices") {
      const { date, sizeIds } = JSON.parse(body);
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
      result = Object.fromEntries(
        sizeIds.map((id) => {
          assert.match(id, /^[0-9a-f-]{36}$/i);
          return [
            id,
            Number(sql(`select library_cake_size_price_on('${id}','${date}')`)),
          ];
        }),
      );
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<html><body><div id="root"></div><script>window.fixtureCake=${JSON.stringify(initialCake).replaceAll("<", "\\u003c")}</script><script src="/app.js"></script></body></html>`,
      );
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(error) }));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("button", {name:"Card fixture",exact:true}).click();
  assert.match(await page.locator("article").innerText(), /4" — Available from 1 Nov 2026/);
  await page.getByRole("button", {name:"Detail fixture",exact:true}).click();
  const four = page.getByRole("button", { name: /4".*Available from/ });
  assert.equal(await four.isVisible(), true);
  assert.equal(await four.isDisabled(), true);
  await page.locator("#fixture-pickup").fill("2026-10-31");
  assert.equal(await four.isDisabled(), true);
  await page.locator("#fixture-pickup").fill("2026-11-01");
  await four.click();
  assert.equal(await four.getAttribute("aria-pressed"), "true");
  assert.equal(
    await page
      .getByRole("img", { name: "4 inch Cake" })
      .first()
      .getAttribute("src"),
    photos[1].url,
  );
  await page.locator("#fixture-pickup").fill("2026-10-31");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button[aria-pressed]")].every(
      (el) => el.getAttribute("aria-pressed") === "false",
    ),
  );
  assert.equal(await four.isDisabled(), true);
  assert.equal(
    await page
      .getByRole("img", { name: "Default Cake" })
      .first()
      .getAttribute("src"),
    photos[0].url,
  );
  await page.locator("#fixture-pickup").fill("2026-11-01");
  assert.equal(await four.getAttribute("aria-pressed"), "false");
  await four.click();
  await page.getByRole("button", { name: "Add to Order", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await page.waitForFunction(
    () =>
      document.querySelector("[role=dialog] button[type=submit]")?.disabled ===
      false,
  );
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("whitebird-preorder-draft-v1"))
          .items[0].sizeId,
    ),
    fourId,
  );
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("whitebird-preorder-draft-v1")).items[0].unitPrice), 88);
  await page.locator("#fixture-pickup").fill("2026-10-31");
  await page
    .getByRole("button", { name: "Summary fixture", exact: true })
    .click();
  const summarySelect = page.locator("#size-0");
  assert.equal(await summarySelect.inputValue(), "");
  assert.equal(
    await summarySelect
      .locator(`option[value="${fourId}"]`)
      .getAttribute("disabled"),
    "",
  );
  assert.match(
    await page.locator("body").innerText(),
    /Available from 1 Nov 2026/,
  );
  await page
    .getByRole("button", { name: "Detail fixture", exact: true })
    .click();
  await page.locator("#fixture-pickup").fill("2026-11-01");
  await page.waitForFunction(() =>
    document.querySelector('select[id^="cart-size-"]'),
  );
  // Restriction changed after the browser loaded its catalogue snapshot.
  sql(
    `update library_cake_sizes set available_from='2026-12-01' where id='${fourId}'`,
  );
  await page
    .getByRole("button", { name: "Increase Thai Milk Tea Mango quantity" })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Available from 1 Dec 2026" })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("whitebird-preorder-draft-v1"))
          .items[0].quantity,
    ),
    1,
  );
  // Stale response from before a pickup-date change cannot update the cart.
  sql(
    `update library_cake_sizes set available_from='2026-11-01' where id='${fourId}'`,
  );
  delayValidation = true;
  await page
    .getByRole("button", { name: "Increase Thai Milk Tea Mango quantity" })
    .click();
  await page.locator("#fixture-pickup").fill("2026-10-31");
  await page
    .getByRole("alert")
    .filter({ hasText: /Your order changed/ })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("whitebird-preorder-draft-v1"))
          .items[0].quantity,
    ),
    1,
  );
  delayValidation = false;
  await page
    .getByRole("button", { name: "Admin fixture", exact: true })
    .click();
  assert.equal(
    await page.locator("input[name=size_available_from]").first().inputValue(),
    "2026-11-01",
  );
  await page
    .locator("input[name=size_available_until]")
    .first()
    .fill("2026-11-30");
  assert.match(await page.locator("body").innerText(), /until 30 Nov 2026/);
  await page.locator("input[name=size_available_from]").first().fill("");
  assert.match(
    await page.locator("body").innerText(),
    /Available until 30 Nov 2026/,
  );
  await page.getByRole("button", { name: "Add size", exact: true }).click();
  assert.equal(
    await page.locator("input[name=size_available_from]").last().inputValue(),
    "",
  );
  assert.equal(
    await page.locator("input[name=size_available_until]").last().inputValue(),
    "",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: browser visible/disabled sizes, no date, October/November, date-change invalidation without substitution, photos, add-to-cart, stale cart server rejection, stale responses, admin create/edit/clear fields",
  );
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
