import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { waitingListConvertibleQuantity } from "../src/engines/waiting-list/conversion-quantity.mjs";

assert.equal(waitingListConvertibleQuantity(1, 0), 1);
assert.equal(waitingListConvertibleQuantity(1, 1), 0);
assert.equal(waitingListConvertibleQuantity(3, 1), 2);
assert.equal(waitingListConvertibleQuantity(1, 2), 0);
assert.equal(waitingListConvertibleQuantity(Number.NaN, 0), 0);

const queries = readFileSync(
  resolve(process.cwd(), "src/workspaces/waiting-list/queries.ts"),
  "utf8",
);
const board = readFileSync(
  resolve(process.cwd(), "src/workspaces/waiting-list/WaitingListBoard.tsx"),
  "utf8",
);
assert.match(queries, /waitingListConvertibleQuantity\(/);
assert.match(board, /row\.convertibleQuantity \?\? row\.remainingQuantity/);

console.log("waiting-list conversion quantity tests passed");
