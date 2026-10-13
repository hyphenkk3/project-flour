/** Browser regression test for the responsive Add to Order confirmation sheet. */
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
const virtualModules = {
  "@/workspaces/storefront/cart/actions": `export async function validateCartSizeAvailability(){return {}}; export async function loadCartEditCakes(){return []}`,
  "@/components/ui/PickupSlotFields": `import React from "react"; export function PickupSlotFields(){return null}`,
  "@/workspaces/storefront/cart/usePreorderDraft": `export function usePreorderDraft(){return window.fixturePickupDate?{pickupDate:window.fixturePickupDate}:null}`,
  "@/components/ui/CakePhotoImage": `import React from "react"; export function CakePhotoImage({src,alt,className,objectFit}){return <div className={"relative h-full w-full "+(className||"")}><img src={src} alt={alt} className={"h-full w-full object-"+objectFit} /></div>}`,
  "@/workspaces/storefront/catalog/usePickupDatePricedCakes": `export function usePickupDatePricedCakes(cakes){return {cakes: cakes.map(c=>({...c, sizes:c.sizes.map(s=>({...s,price:s.price+10}))})),ready:true}}`,
  "@/workspaces/storefront/cart/open-order": `export function openStorefrontOrder(){}`,
  "@/workspaces/storefront/checkout/preorder-draft": `export function draftLineQuantity(){return 0} export function emptyPreorderDraft(){return {items:[]}} export function mergeDraftItem(draft,item){return {...draft,items:[...draft.items,item]}} export function readPreorderDraft(){return window.fixtureDraft} export function setDraftLineQuantity(){return {items:[]}} export function writePreorderDraft(draft){window.fixtureDraft=draft}`,
  "@/workspaces/storefront/catalog/cake-photo-map": `export function storefrontPhotoForSize(photos,sizeId){return photos.find(p=>p.cakeSizeId===sizeId)||photos.find(p=>p.isDefault)||photos[0]||null}`,
};
const build = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["scripts/fixtures/add-to-order-popup-browser.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  tsconfig: path.join(root, "tsconfig.json"),
  plugins: [
    {
      name: "isolated-popup-services",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) =>
          Object.hasOwn(virtualModules, args.path)
            ? { path: args.path, namespace: "fixture" }
            : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents: virtualModules[args.path],
          loader: "tsx",
          resolveDir: root,
        }));
      },
    },
  ],
});
const css = readdirSync(path.join(root, ".next/static/chunks"))
  .filter((name) => name.endsWith(".css"))
  .map((name) =>
    readFileSync(path.join(root, ".next/static/chunks", name), "utf8"),
  )
  .join("\n");
assert.ok(
  css.includes(".object-contain"),
  "production CSS exists; run the production build first",
);
const server = createServer((req, res) => {
  if (req.url === "/bundle.js") {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(build.outputFiles[0].text);
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>const photo=(id)=>({id,url:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="180"/%3E',altText:'Cake photo',sortOrder:0,cakeSizeId:id,isDefault:!id});window.fixtureCakes=[1,2,3].map((count,index)=>({id:'cake-'+count,name:['Avocado','Japanese Strawberry','Chocolate D’Amour'][index],description:null,sharingGuide:null,allergens:[],image:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="180"/%3E',photos:[photo(null)],sizes:Array.from({length:count},(_,i)=>({id:'size-'+count+'-'+i,cakeId:'cake-'+count,size:[ '4"', '6"', '8"' ][i],price:75+i*30,sortOrder:i,preorderDays:2,availableFrom:(count===3&&i===0)?'2026-11-01':null,availableUntil:null}))}));window.fixtureCakeIndex=0;window.fixtureInitialSizeId='size-3-2';window.fixturePickupDate=null;window.fixtureDraft=null;window.fixtureAdded=null;</script><script src="/bundle.js"></script></body></html>`,
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
    viewport: { width: 1200, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`);
  let dialog = page.getByRole("dialog");
  assert.equal(
    await dialog.getByRole("heading", { name: "Avocado" }).isVisible(),
    true,
  );
  assert.equal(await dialog.getByText('4"', { exact: true }).count(), 1);
  assert.equal(
    await dialog.locator('input[type="radio"]').count(),
    0,
    "one-size cakes need no selection step",
  );
  assert.equal(
    await dialog.getByText("RM85").count(),
    1,
    "resolved date-aware single-size price is shown",
  );
  const thumbnail = dialog.getByRole("img", { name: "Cake photo" });
  assert.match(await thumbnail.getAttribute("class"), /object-contain/);
  assert.deepEqual(
    await thumbnail
      .boundingBox()
      .then(({ width, height }) => ({ width, height })),
    { width: 80, height: 80 },
  );

  await page.evaluate(() => window.setFixtureCake(1, "size-2-1"));
  dialog = page.getByRole("dialog");
  let radios = dialog.locator('input[type="radio"]');
  assert.equal(await radios.count(), 2);
  assert.equal(
    await radios.nth(1).isChecked(),
    true,
    "product-page-selected size is retained on open",
  );
  await radios.nth(0).focus();
  assert.equal(
    await radios
      .nth(0)
      .evaluate((radio) => radio.closest("label").matches(":focus-within")),
    true,
    "keyboard focus is carried by the complete size row",
  );
  await dialog.getByRole("button", { name: "Increase quantity" }).click();
  assert.equal(await dialog.locator('[aria-live="polite"]').innerText(), "2");
  await dialog.getByText('4"', { exact: true }).click();
  assert.equal(
    await radios.nth(0).isChecked(),
    true,
    "entire size row is selectable",
  );

  await page.evaluate(() => window.setFixtureCake(2, "size-3-2"));
  dialog = page.getByRole("dialog");
  radios = dialog.locator('input[type="radio"]');
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[role="dialog"] input[type="radio"]')
        .length === 3,
  );
  assert.equal(await radios.count(), 3);
  assert.equal(await radios.nth(2).isChecked(), true);
  await page.evaluate(() => {
    window.fixturePickupDate = "2026-10-31";
    window.setFixtureCake(2, "size-3-1");
  });
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[role="dialog"] input[type="radio"]')
        .length === 3,
  );
  await page.evaluate(() => window.setFixtureCake(2, "size-3-2"));
  radios = page.getByRole("dialog").locator('input[type="radio"]');
  await page.waitForFunction(
    () =>
      document.querySelector('[role="dialog"] input[type="radio"]')
        ?.disabled === true,
  );
  assert.equal(
    await radios.nth(0).isDisabled(),
    true,
    "date-unavailable size stays unselectable",
  );
  assert.equal(await radios.nth(2).isChecked(), true);
  await dialog.getByRole("button", { name: "Increase quantity" }).click();
  await dialog.getByRole("button", { name: "Increase quantity" }).click();
  await dialog.getByRole("button", { name: "Add to Order" }).click();
  assert.equal(await page.evaluate(() => window.fixtureAdded), "added");
  const saved = await page.evaluate(() => window.fixtureDraft.items[0]);
  assert.equal(saved.sizeId, "size-3-2");
  assert.equal(saved.sizeLabel, '8"');
  assert.equal(
    saved.unitPrice,
    145,
    "resolved effective price is transferred to cart",
  );
  assert.equal(saved.quantity, 3);

  const desktopWidths = [];
  const cakeNames = ["Avocado", "Japanese Strawberry", "Chocolate D’Amour"];
  for (const index of [0, 1, 2]) {
    await page.evaluate(
      (i) => window.setFixtureCake(i, window.fixtureCakes[i].sizes.at(-1).id),
      index,
    );
    await page
      .getByRole("dialog")
      .getByRole("heading", { name: cakeNames[index] })
      .waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const rect = document
        .querySelector('[role="dialog"]')
        ?.getBoundingClientRect();
      return Boolean(rect && rect.width > 0 && rect.height > 0);
    });
    const box = await page.getByRole("dialog").boundingBox();
    assert.ok(
      box,
      `dialog has no box at desktop index ${index}: ${JSON.stringify(await page.locator('[role="dialog"]').evaluate((el) => ({ style: getComputedStyle(el).display, html: el.outerHTML.slice(0, 200) })))}`,
    );
    desktopWidths.push(box.width);
  }
  assert.ok(
    Math.max(...desktopWidths) - Math.min(...desktopWidths) <= 1,
    "desktop sheet width remains consistent",
  );

  for (const width of [320, 375, 390, 393, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.setFixtureCake(2, "size-3-2"));
    const sheet = page.getByRole("dialog");
    const metrics = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const add = [...dialog.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Add to Order",
      );
      const quantity = dialog.querySelector('[role="group"]');
      return {
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
        dialog: dialog.getBoundingClientRect().toJSON(),
        add: add?.getBoundingClientRect().toJSON(),
        quantity: quantity?.getBoundingClientRect().toJSON(),
      };
    });
    assert.equal(
      metrics.page,
      metrics.viewport,
      `no horizontal page overflow at ${width}px`,
    );
    assert.ok(
      metrics.dialog.left >= 0 && metrics.dialog.right <= width,
      `sheet fits ${width}px viewport`,
    );
    assert.ok(
      metrics.add.top >= 0 && metrics.add.bottom <= 844,
      `Add button visible at ${width}px`,
    );
    assert.ok(
      metrics.quantity.top >= 0 && metrics.quantity.bottom <= 844,
      `quantity controls visible at ${width}px`,
    );
    assert.equal(await sheet.locator('input[type="radio"]').count(), 3);
  }

  await page.setViewportSize({ width: 390, height: 568 });
  await page.evaluate(() => window.setFixtureCake(2, "size-3-2"));
  assert.equal(
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Add to Order" })
      .isVisible(),
    true,
    "short mobile viewport retains accessible CTA",
  );
  await page.keyboard.press("Tab");
  assert.ok((await page.locator(":focus-visible").count()) >= 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS Add to Order popup browser regression: 1/2/3 sizes, retained size, cart payload, desktop and iPhone-sized viewports",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
