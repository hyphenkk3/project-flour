import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const directory = read("src/workspaces/library/cakes/CakeDirectory.tsx");
const shell = read("src/components/shell/AppShell.tsx");
const container = read("src/components/shell/PageContainer.tsx");
const mobileNav = read("src/components/shell/MobileNavigation.tsx");
const rootLayout = read("src/app/layout.tsx");

assert.match(
  directory,
  /className="border-fog min-w-0 rounded-xl border bg-white p-4 sm:min-w-\[auto\]"/,
);
assert.match(directory, /grid gap-3 sm:grid-cols-2/);
assert.match(directory, /className="min-w-0 flex-1"/);
assert.match(directory, /grid gap-3 sm:grid-cols-2 lg:grid-cols-3/);
assert.match(shell, /<PageContainer>\{children\}<\/PageContainer>/);
assert.match(
  container,
  /w-full max-w-5xl px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-8/,
);
assert.match(mobileNav, /fixed inset-x-0 bottom-0/);
assert.match(mobileNav, /md:hidden/);
assert.match(mobileNav, /pb-\[env\(safe-area-inset-bottom\)\]/);
assert.doesNotMatch(rootLayout, /storefrontViewport/);

console.log("Library mobile card sizing and shared staff shell checks passed.");
