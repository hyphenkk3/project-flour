import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { preserveOrderEditorStateOnReset } from "../src/workspaces/owner/orders/preserve-action-form-state.mjs";

const source = readFileSync(
  resolve(process.cwd(), "src/workspaces/owner/orders/OrderWorkspaceForm.tsx"),
  "utf8",
);

let prevented = false;
preserveOrderEditorStateOnReset({
  preventDefault() {
    prevented = true;
  },
});
assert.equal(prevented, true, "failed Server Action reset must be canceled");
assert.match(
  source,
  /<form[\s\S]*?action=\{\(formData\) => \{[\s\S]*?verifiedStaffCakeSizeSubmission\([\s\S]*?formAction\(formData\)[\s\S]*?onReset=\{preserveOrderEditorStateOnReset\}/,
  "the order editor must verify current prices before calling its guarded Server Action and preserve state on reset",
);
assert.match(
  source,
  /onSubmit=\{\(event\) => \{[\s\S]*?if \(!cakePriceVerified\) event\.preventDefault\(\)/,
);
assert.match(
  source,
  /if \(!state\.success\) return;/,
  "a rejected save must remain in edit mode with its current state",
);

console.log("order workspace failed-save state tests passed");
