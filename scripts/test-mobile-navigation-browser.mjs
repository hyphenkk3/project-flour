/** Browser regression test for the fixed mobile workspace navigation. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const esbuild = require("/Users/ycwee/.npm/_npx/95c8da6ffd4052b6/node_modules/esbuild");
const {
  chromium,
} = require("/Users/ycwee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = process.cwd();
const entry = `
import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {MobileNavigation} from "@/components/shell/MobileNavigation";
import {getNavigationForRole} from "@/foundation/navigation/workspaces";
function Harness() {
  const [path, setPath] = useState("/home");
  window.navigateWorkspace = (nextPath) => setPath(nextPath);
  return <><MobileNavigation items={getNavigationForRole("owner")} currentPath={path}/><main style={{minHeight:"140vh",padding:"24px"}}>Workspace content</main></>;
}
createRoot(document.getElementById("root")).render(<Harness/>);
`;
const virtualModules = {
  "next/link": `import React from "react"; export default function Link({href,children,scroll,...props}) { return React.createElement("a", {href, ...props, onClick(event) { event.preventDefault(); window.navigateWorkspace?.(href); }}, children); }`,
};
const result = await esbuild.build({
  stdin: {
    contents: entry,
    resolveDir: root,
    sourcefile: "mobile-navigation-regression.tsx",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  tsconfig: path.join(root, "tsconfig.json"),
  plugins: [
    {
      name: "test-boundaries",
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) =>
          Object.hasOwn(virtualModules, args.path)
            ? { path: args.path, namespace: "test-boundary" }
            : undefined,
        );
        build.onLoad({ filter: /.*/, namespace: "test-boundary" }, (args) => ({
          contents: virtualModules[args.path],
          loader: "tsx",
          resolveDir: root,
        }));
      },
    },
  ],
});
const bundle = result.outputFiles[0].text;
const cssName = readdirSync(path.join(root, ".next/static/chunks")).find(
  (name) => name.endsWith(".css"),
);
assert.ok(cssName, "production CSS exists; run the production build first");
const css = readFileSync(
  path.join(root, ".next/static/chunks", cssName),
  "utf8",
);
const server = createServer((req, res) => {
  if (req.url === "/bundle.js") {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(bundle);
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`,
  );
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(`http://127.0.0.1:${address.port}`);
  const scrollArea = page.locator(
    'nav[aria-label="Workspaces"] [role="group"]',
  );
  const links = scrollArea.locator("a");
  const expectedLabels = [
    "Home",
    "Operations",
    "Calendar",
    "Bakery",
    "Collection",
    "Library",
    "Customers",
    "Management",
  ];

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => window.navigateWorkspace("/home"));
    await scrollArea.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role="group"] [aria-current="page"]')
          ?.getAttribute("href") === "/home",
    );
    assert.equal(await links.count(), expectedLabels.length);
    assert.deepEqual(await links.allTextContents(), expectedLabels);
    const initial = await scrollArea.evaluate((element) => ({
      width: element.clientWidth,
      content: element.scrollWidth,
      left: element.scrollLeft,
      paddingBottom: Number.parseFloat(
        getComputedStyle(element.parentElement.parentElement).paddingBottom,
      ),
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    assert.ok(initial.content > initial.width, `${width}px nav is scrollable`);
    assert.equal(initial.pageWidth, initial.viewportWidth, "no page overflow");
    assert.ok(
      initial.paddingBottom >= 4,
      "bottom safe-area spacing is present",
    );
    assert.equal(
      initial.left,
      0,
      "first item starts at the initial scroll position",
    );

    const first = await links.nth(0).evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const viewport =
        element.parentElement.parentElement.getBoundingClientRect();
      return bounds.left >= viewport.left && bounds.right <= viewport.right;
    });
    assert.equal(first, true, "first navigation item is fully reachable");

    const whiteSpace = await links
      .locator("span")
      .evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).whiteSpace),
      );
    assert.ok(
      whiteSpace.every((value) => value === "nowrap"),
      "labels do not wrap",
    );

    await scrollArea.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    const last = await links.nth(7).evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const viewport =
        element.parentElement.parentElement.getBoundingClientRect();
      return bounds.left >= viewport.left && bounds.right <= viewport.right;
    });
    assert.equal(last, true, "last navigation item is fully reachable");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await scrollArea.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await page.evaluate(() => window.navigateWorkspace("/owner/management"));
    await page.waitForFunction(() => {
      const container = document.querySelector('[role="group"]');
      const active = container?.querySelector('[aria-current="page"]');
      if (!container || !active) return false;
      const outer = container.getBoundingClientRect();
      const item = active.getBoundingClientRect();
      return item.left >= outer.left && item.right <= outer.right;
    });
    assert.equal(await links.nth(7).getAttribute("aria-current"), "page");
    const activeScroll = await scrollArea.evaluate(
      (element) => element.scrollLeft,
    );
    await page.evaluate(() =>
      window.navigateWorkspace("/owner/management/reports"),
    );
    await page.waitForTimeout(50);
    assert.equal(
      await scrollArea.evaluate((element) => element.scrollLeft),
      activeScroll,
      "already-visible active item does not trigger another scroll",
    );
  }

  await page.setViewportSize({ width: 1024, height: 768 });
  assert.equal(
    await page
      .locator('nav[aria-label="Workspaces"]')
      .evaluate((element) => getComputedStyle(element).display),
    "none",
    "mobile navigation stays hidden on desktop",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log(
  "Mobile workspace navigation browser checks passed at 320px and 390px, including overflow, labels, reachability, active reveal, reduced motion, and desktop hiding.",
);
