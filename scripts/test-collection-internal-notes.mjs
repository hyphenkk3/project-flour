import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const select = read("src/workspaces/collection/select.ts");
const mapping = read("src/workspaces/collection/map-order.ts");
const types = read("src/workspaces/collection/types.ts");
const card = read("src/workspaces/collection/CollectionOrderCard.tsx");
const detail = read("src/workspaces/collection/CollectionOrderDetail.tsx");

assert.match(select, /\binternal_notes\b/, "Collection query must retrieve internal notes");
assert.match(select, /\bcustomer_notes\b/, "original customer notes must remain accessible");
assert.match(mapping, /internalNotes:\s*row\.internal_notes/, "row mapping must retain internal notes");
assert.match(types, /internalNotes:\s*string\s*\|\s*null/, "nullable note supported");
assert.match(card, /order\.internalNotes\?\.trim\(\)/, "cards derive text from internal notes only");
assert.match(card, /font-bold/, "staff-reviewed instructions visibly bold");
assert.match(card, /whitespace-pre-wrap/, "long notes not silently truncated");
assert.doesNotMatch(card, /Order note:/, "original customer notes cannot pose as crew instructions");
assert.match(detail, /aria-label="Internal Notes"/, "detail displays staff notes");
assert.match(detail, /CustomerOrderNoteCallout/, "original customer note retained separately");
assert.match(detail, /aria-label="Customer Order Note"/, "original customer note labelled");
assert.doesNotMatch(card + detail, /bakeryAttention\s*=/, "internal note must not set Bakery Attention");
console.log("Collection Internal Notes static regression checks passed");
