import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "src/workspaces/storefront/checkout/actions.ts",
  "utf8",
);
const start = source.indexOf("async function loadCustomerPreorderOptions(");
const end = source.indexOf(
  "\nexport async function loadCheckoutPickupOffer",
  start,
);
assert(start >= 0 && end > start, "Checkout options loader must exist.");

const loader = source.slice(start, end);
assert(
  !loader.includes("[CHECKOUT OPTION DEBUG]"),
  "Successful checkout option loads must not emit error-level debug records.",
);
assert.equal(
  (loader.match(/console\.error\(/g) ?? []).length,
  1,
  "Only one error-level record should be emitted for the RPC failure path.",
);
assert.match(
  loader,
  /if \(error\) \{\s*console\.error\("\[CHECKOUT OPTIONS\] RPC failed", \{\s*code: error\.code \?\? null,\s*message: error\.message\.slice\(0, 240\),\s*\}\);\s*return empty;\s*\}/,
  "RPC failures should retain bounded, non-payload diagnostics.",
);
assert(
  !/console\.error\([^;]*(?:data|complimentary|paidAddons)/s.test(loader),
  "Customer option payloads must not be included in logs.",
);

console.log("Checkout option logging contract: PASS");
