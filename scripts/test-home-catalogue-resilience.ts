import assert from "node:assert/strict";
import { settlePublicCatalogueRead } from "../src/workspaces/storefront/home/settle-public-catalogue-read.ts";

const empty = await settlePublicCatalogueRead(Promise.resolve([] as string[]));
assert.deepEqual(
  empty,
  { ok: true, value: [] },
  "a genuine empty catalogue is successful data",
);

const unavailable = await settlePublicCatalogueRead(
  Promise.reject(new Error("network timeout")),
);
assert.deepEqual(
  unavailable,
  { ok: false },
  "a failed catalogue remains distinguishable from empty data",
);

const [healthySection, failedSection] = await Promise.all([
  settlePublicCatalogueRead(Promise.resolve(["visible-cake"])),
  settlePublicCatalogueRead(Promise.reject(new Error("timeout"))),
]);
assert.deepEqual(healthySection, { ok: true, value: ["visible-cake"] });
assert.deepEqual(failedSection, { ok: false });

console.log(
  "PASS homepage public catalogue failures are isolated from healthy sections and empty results remain distinct",
);
