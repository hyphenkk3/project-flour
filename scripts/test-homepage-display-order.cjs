const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const selectorSource = read("src/engines/menu/homepage-featured-collections.ts");
const compiled = ts.transpileModule(selectorSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function("exports", "require", "module", compiled)(
  loaded.exports,
  require,
  loaded,
);
const { HOMEPAGE_FEATURED_COLLECTION_MAX, selectHomepageFeaturedCollections } =
  loaded.exports;

assert.equal(HOMEPAGE_FEATURED_COLLECTION_MAX, 4);
const selection = selectHomepageFeaturedCollections({
  todayYearMonth: "2026-12",
  specials: [
    { id: "christmas", displayOrder: 1 },
    { id: "fourth-special", displayOrder: 5 },
  ],
  monthlies: [
    { id: "december", month: "2026-12-01", displayOrder: 2 },
    { id: "november", month: "2026-11-01", displayOrder: 3 },
    { id: "future-month", month: "2030-01-01", displayOrder: 4 },
  ],
});
assert.deepEqual(
  selection.featured.map(({ id }) => id),
  ["christmas", "december", "november", "future-month"],
  "the saved cross-purpose Library order wins over current/upcoming month priority",
);
assert.equal(selection.featured.length, 4, "Popular Cakes is outside the dynamic cap");
assert.equal("more" in selection, false, "overflow has no below-Popular link list");

const noChronologyPriority = selectHomepageFeaturedCollections({
  todayYearMonth: "2026-12",
  specials: [{ id: "special-later", displayOrder: 8 }],
  monthlies: [
    { id: "future-first", month: "2032-01-01", displayOrder: 1 },
    { id: "current-last", month: "2026-12-01", displayOrder: 9 },
  ],
});
assert.deepEqual(
  noChronologyPriority.featured.map(({ id }) => id),
  ["future-first", "special-later", "current-last"],
);

const duplicateSafe = selectHomepageFeaturedCollections({
  todayYearMonth: "2026-12",
  specials: [{ id: "same-id", displayOrder: 2 }],
  monthlies: [{ id: "same-id", month: "2026-12-01", displayOrder: 0 }],
});
assert.deepEqual(duplicateSafe.featured.map(({ id }) => id), ["same-id"]);
assert.throws(
  () =>
    selectHomepageFeaturedCollections({
      todayYearMonth: "2026-12",
      specials: [{ id: "unconfigured-special" }],
      monthlies: [{ id: "unconfigured-month", month: "2026-12-01" }],
    }),
  /display order is unavailable/,
  "missing Library ordering fails closed instead of guessing a calendar order",
);

const home = read("src/workspaces/storefront/home/StorefrontHomePage.tsx");
const hero = home.indexOf("<HomeHero");
const fresh = home.indexOf("<HomeFreshPicksSection");
const collection = home.indexOf("<HomeFeaturedCollection");
const popular = home.lastIndexOf("<HomePopularCakes");
assert.ok(hero >= 0 && fresh > hero && collection > fresh && popular > collection);
assert.doesNotMatch(home, /HomeMoreCollections/);
assert.doesNotMatch(home, /selection\?\.more/);

const catalogQueries = read("src/workspaces/storefront/catalog/queries.ts");
const monthlyQuery = catalogQueries.slice(
  catalogQueries.indexOf("async function loadOrderableMonthlyCatalogues"),
  catalogQueries.indexOf("const readCachedOrderableMonthlyCatalogues"),
);
const specialQuery = catalogQueries.slice(
  catalogQueries.indexOf("async function loadCustomerSpecialCatalogues"),
  catalogQueries.indexOf("const readCachedCustomerSpecialCatalogues"),
);
assert.match(monthlyQuery, /\.eq\("status", "active"\)/);
assert.match(monthlyQuery, /\.eq\("purpose", "monthly"\)/);
assert.match(monthlyQuery, /\.order\("display_order", \{ ascending: true \}\)/);
assert.match(monthlyQuery, /isCustomerOrderableMonthlyMonth/);
assert.match(specialQuery, /\.eq\("status", "active"\)/);
assert.match(specialQuery, /\.eq\("purpose", "special"\)/);
assert.match(specialQuery, /\.eq\("website_override", true\)/);
assert.match(specialQuery, /\.order\("display_order", \{ ascending: true \}\)/);
assert.match(specialQuery, /isCurrentlyCustomerOrderable/);

const libraryAction = read("src/workspaces/library/collections/actions.ts");
assert.match(libraryAction, /displayOrdersFromIds\(ids\)/);
assert.match(libraryAction, /update\(\{ display_order: update\.displayOrder \}\)/);

const section = read("src/workspaces/storefront/home/HomeFeaturedCollection.tsx");
assert.match(section, /return \(\s*<section/);
assert.match(section, /Photo coming soon/);

for (const fileName of [
  "src/engines/menu/homepage-featured-collections.ts",
  "src/workspaces/storefront/home/StorefrontHomePage.tsx",
  "scripts/test-homepage-structure.ts",
  "scripts/test-storefront-landing.ts",
]) {
  const source = read(fileName);
  const result = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  assert.deepEqual(
    (result.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    ),
    [],
    `${fileName} parses and transpiles without syntax diagnostics`,
  );
}

const Module = require("node:module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const base = path.join(root, "src", request.slice(2));
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, "utf8");
    const result = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    });
    module._compile(result.outputText, filename);
  };
}
require("./test-homepage-structure.ts");

console.log("HOMEPAGE_COLLECTION_DISPLAY_ORDER=PASS");
console.log("DYNAMIC_SECTION_CAP=PASS count=4");
console.log("PUBLISHED_ORDERABLE_FILTERS=PASS");
console.log("NO_OVERFLOW_COLLECTION_LINKS=PASS");
console.log("POPULAR_CAKES_AFTER_DYNAMIC_COLLECTIONS=PASS");
console.log("PHOTO_INDEPENDENT_SECTION=PASS");
console.log("AFFECTED_TYPESCRIPT_SYNTAX=PASS files=4");
