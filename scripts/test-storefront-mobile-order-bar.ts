/** Mobile order bar presentation and desktop isolation (static). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(
    process.cwd(),
    "src/workspaces/storefront/cart/StorefrontCartShell.tsx",
  ),
  "utf8",
);
const mobileStart = source.indexOf(
  "      <button\n        aria-label={`${itemLabel}",
);
const desktopStart = source.indexOf("      {!desktopRail ? (", mobileStart);
const portalStart = source.indexOf("      {createPortal(", desktopStart);
assert.ok(
  mobileStart >= 0 && desktopStart > mobileStart && portalStart > desktopStart,
);

const mobile = source.slice(mobileStart, desktopStart);
const desktop = source.slice(desktopStart, portalStart);
assert.equal((mobile.match(/<button\b/g) ?? []).length, 1);
assert.equal((mobile.match(/<\/button>/g) ?? []).length, 1);
assert.doesNotMatch(mobile, /<(?:a|Link)\b/);
assert.match(mobile, /type="button"/);
assert.match(mobile, /onClick=\{\(\) => setOpen\(true\)\}/);
assert.match(mobile, /fixed right-0 bottom-0 left-0/);
assert.match(mobile, /md:hidden/);
assert.match(mobile, /min-h-\[4\.25rem\]/);
assert.match(
  mobile,
  /aria-label=\{`\$\{itemLabel\}, \$\{formatRm\(total\)\}\. View order\.`\}/,
);
assert.match(mobile, /Your Order/);
assert.match(mobile, /\{itemLabel\}/);
assert.match(mobile, /pricesPending \? "Checking price…" : formatRm\(total\)/);
assert.match(mobile, /flex min-w-0 flex-1 flex-col/);
assert.match(mobile, /flex flex-wrap items-baseline/);
assert.match(mobile, /inline-flex shrink-0 items-center gap-2 border-l/);
assert.match(mobile, /View Order/);
assert.match(
  mobile,
  /aria-hidden="true" className="text-lg leading-none">\s*→/,
);
assert.match(
  mobile,
  /paddingBottom: "max\(0\.5rem, env\(safe-area-inset-bottom\)\)"/,
);
assert.match(
  source,
  /h-\[calc\(4\.25rem\+env\(safe-area-inset-bottom,0px\)\)\] md:hidden/,
);

assert.match(desktop, /hidden md:block/);
assert.match(desktop, /min-h-16 w-full items-center justify-between/);
assert.match(desktop, /Collection date/);
assert.match(desktop, /Earliest collection/);
assert.match(desktop, /View Order/);
assert.match(desktop, /onClick=\{\(\) => setOpen\(true\)\}/);

console.log("PASS storefront mobile order bar presentation");
