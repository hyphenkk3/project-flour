import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const query = read("src/workspaces/owner/orders/queries.ts");
const workspace = read("src/workspaces/owner/orders/OrderWorkspaceForm.tsx");

assert.match(
  query,
  /\binternal_notes\b/,
  "Operations query must select internal notes",
);
assert.match(
  query,
  /internalNotes:\s*row\.internal_notes/,
  "Operations DTO must preserve internal notes",
);
assert.match(
  workspace,
  /function InternalOrderNoteCallout\(\{ note \}: \{ note: string \| null \}\)/,
  "Operations workspace must render a dedicated internal note callout",
);
assert.match(
  workspace,
  /const content = note\?\.trim\(\);\s*if \(!content\) return null;/,
  "Empty internal notes must not render a placeholder panel",
);
assert.match(workspace, /border-\[#EBCB77\] bg-\[#FFF8DF\]/);
assert.match(workspace, /text-\[#805513\]/);
assert.match(workspace, /text-\[#493A25\]/);
assert.match(workspace, /font-bold/);
assert.match(workspace, /whitespace-pre-wrap/);
assert.match(workspace, /break-words/);
assert.equal(
  (
    workspace.match(
      /<InternalOrderNoteCallout note=\{order\.internalNotes\} \/>/g,
    ) ?? []
  ).length,
  2,
  "Read and edit workspace modes must both show the populated internal note",
);
assert.equal(
  (
    workspace.match(/<CustomerOrderNoteCallout note=\{order\.notes\} \/>/g) ??
    []
  ).length,
  2,
  "Customer Order Note must remain separately rendered in both modes",
);
assert.doesNotMatch(workspace, /No internal notes\./);
assert.match(
  workspace,
  /name="internal_notes"/,
  "Existing note editing must remain available",
);
assert.match(
  workspace,
  /Bakery attention/,
  "Bakery Attention section must remain intact",
);

console.log("PASS Operations Order Workspace Internal Notes source checks");
