const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const helperPath = path.join(root, "src/engines/orders/customer-name.ts");
const helperSource = fs.readFileSync(helperPath, "utf8");
const helperOutput = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const helperExports = {};
vm.runInNewContext(helperOutput, {
  exports: helperExports,
  Set,
  Array,
});
const { customerNameValidationError } = helperExports;

assert.equal(
  customerNameValidationError("Phoebe"),
  "Please enter your name and surname with a space between them.",
);
assert.equal(customerNameValidationError("  Phoebe   Renny  "), null);
assert.equal(customerNameValidationError("Mary Jane Tan"), null);
assert.equal(customerNameValidationError("李 小龍"), null);
assert.equal(customerNameValidationError("O’Connor Lee"), null);
for (const title of [
  "Mr", "Mrs", "Ms", "Miss", "Mdm", "Madam", "Dr", "Prof",
  "Professor", "Sir", "Datuk", "Dato", "Datin",
]) {
  assert.equal(
    customerNameValidationError(`${title}. Phoebe Renny`),
    "Please enter your name without a title.",
    `${title} remains prohibited by the shared validator`,
  );
}

const formSource = fs.readFileSync(
  path.join(root, "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx"),
  "utf8",
);
assert.match(
  formSource,
  /import \{ customerNameValidationError \} from "@\/engines\/orders\/customer-name";/,
);
assert.match(
  formSource,
  /customerNameValidationError\([\s\S]*?FormData\(form\)\.get\("customer_name"\)/,
);
assert.match(formSource, /customer_name: customerNameError/);
assert.match(formSource, /error=\{fieldErrors\.customer_name\}/);

const actionSource = fs.readFileSync(
  path.join(root, "src/workspaces/storefront/extra/actions.ts"),
  "utf8",
);
assert.match(actionSource, /customerNameValidationError\(customerName\)/);
const validationAt = actionSource.indexOf(
  "const customerNameError = customerNameValidationError(customerName)",
);
assert.notEqual(validationAt, -1);
for (const laterDependency of [
  "loadOperatingHoursSnapshot()",
  "getStorefrontExtraById(extraStockId)",
  'supabase.rpc("submit_guest_extra_order"',
]) {
  assert.ok(
    validationAt < actionSource.indexOf(laterDependency),
    `name validation runs before ${laterDependency}`,
  );
}

const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20261031045711_fresh_pick_customer_name_validation.sql",
  ),
  "utf8",
);
assert.match(migration, /BEFORE INSERT ON public\.orders/);
assert.match(migration, /NEW\.extra_stock_id IS NOT NULL/);
assert.match(migration, /NEW\.order_source = 'customer_website'/);
assert.match(migration, /FROM PUBLIC/);
assert.match(migration, /22023/);
assert.doesNotMatch(migration, /UPDATE public\.orders|DELETE FROM public\.orders/i);

console.log(
  "PASS: shared customer-name policy and Fresh Pick client/server/database boundaries are covered.",
);
