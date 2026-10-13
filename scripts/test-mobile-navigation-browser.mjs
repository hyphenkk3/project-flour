/** Browser regression test for the fixed, compact mobile workspace navigation. */
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
  const [role, setRole] = useState("owner");
  window.navigateWorkspace = (nextPath) => setPath(nextPath);
  window.setNavigationRole = (nextRole) => setRole(nextRole);
  return <><MobileNavigation items={getNavigationForRole(role)} currentPath={path}/><main style={{minHeight:"140vh",padding:"24px"}}>Workspace content</main></>;
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
  const nav = page.locator('nav[aria-label="Workspaces"]');
  const links = nav.locator("a");
  const expectedLabels = [
    "Home",
    "Ops",
    "Calendar",
    "Bakery",
    "Collect",
    "Library",
    "Customer",
    "Manage",
  ];

  for (const width of [320, 375, 390, 393, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => window.setNavigationRole("owner"));
    await page.evaluate(() => window.navigateWorkspace("/home"));
    await page.waitForFunction(
      () =>
        document
          .querySelector('nav [aria-current="page"]')
          ?.getAttribute("href") === "/home",
    );
    assert.equal(await links.count(), expectedLabels.length);
    assert.deepEqual(await links.allTextContents(), expectedLabels);
    const layout = await nav.evaluate((element) => ({
      width: element.clientWidth,
      content: element.scrollWidth,
      paddingBottom: Number.parseFloat(getComputedStyle(element).paddingBottom),
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      position: getComputedStyle(element).position,
    }));
    assert.equal(
      layout.content,
      layout.width,
      `${width}px nav does not scroll`,
    );
    assert.equal(layout.pageWidth, layout.viewportWidth, "no page overflow");
    assert.ok(layout.paddingBottom >= 4, "bottom safe-area spacing is present");
    assert.equal(layout.position, "fixed", "navigation stays fixed");

    const geometry = await links.evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        const navBounds = element.closest("nav").getBoundingClientRect();
        const label = element.querySelector("span");
        const labelBounds = label.getBoundingClientRect();
        const style = getComputedStyle(label);
        return {
          left: bounds.left,
          right: bounds.right,
          navLeft: navBounds.left,
          navRight: navBounds.right,
          width: bounds.width,
          height: bounds.height,
          labelLeft: labelBounds.left,
          labelRight: labelBounds.right,
          labelWidth: labelBounds.width,
          labelScrollWidth: label.scrollWidth,
          whiteSpace: style.whiteSpace,
          fontSize: style.fontSize,
        };
      }),
    );
    for (const [index, item] of geometry.entries()) {
      assert.ok(
        item.left >= item.navLeft,
        `${width}px item ${index} left visible`,
      );
      assert.ok(
        item.right <= item.navRight,
        `${width}px item ${index} right visible`,
      );
      assert.ok(item.width >= 36, `${width}px item ${index} has usable width`);
      assert.ok(
        item.height >= 48,
        `${width}px item ${index} has usable height`,
      );
      assert.ok(
        item.labelLeft >= item.left,
        `${width}px label ${index} starts inside its tap target`,
      );
      assert.ok(
        item.labelRight <= item.right,
        `${width}px label ${index} ends inside its tap target`,
      );
      assert.ok(
        item.labelScrollWidth <= item.labelWidth + 1,
        `${width}px label ${index} is not clipped`,
      );
      assert.equal(
        item.whiteSpace,
        "nowrap",
        `${width}px label ${index} stays on one line`,
      );
      assert.equal(
        item.fontSize,
        "10px",
        "compact labels remain readable at 10px",
      );
    }
    const first = geometry[0];
    const last = geometry.at(-1);
    assert.ok(first.left >= first.navLeft, "first item is visible");
    assert.ok(last.right <= last.navRight, "last item is visible");

    const active = links.nth(0);
    assert.equal(await active.getAttribute("aria-current"), "page");
    assert.match(
      await active.getAttribute("class"),
      /text-signal/,
      "active item remains visually distinguished",
    );

    for (const [role, labels] of [
      ["manager", expectedLabels],
      [
        "customer_operations",
        ["Home", "Ops", "Calendar", "Collect", "Customer"],
      ],
      ["bakery", ["Home", "Calendar", "Bakery", "Collect", "Library"]],
      ["collection", ["Home", "Collect"]],
    ]) {
      await page.evaluate(
        (nextRole) => window.setNavigationRole(nextRole),
        role,
      );
      assert.deepEqual(
        await links.allTextContents(),
        labels,
        `${role} role order and visibility`,
      );
      assert.equal(
        await nav.evaluate(
          (element) => element.scrollWidth === element.clientWidth,
        ),
        true,
        `${width}px ${role} navigation has no horizontal scrolling`,
      );
    }
    await page.evaluate(() => window.setNavigationRole("owner"));
    await page.waitForFunction(
      () => document.querySelectorAll("nav a").length === 8,
    );

    await page.evaluate(() => window.navigateWorkspace("/owner/management"));
    await page.waitForFunction(
      () =>
        document.querySelector('nav a[aria-current="page"]')?.textContent ===
        "Manage",
    );
    assert.match(
      await links.nth(7).getAttribute("class"),
      /text-signal/,
      "Management active indicator remains visible at the final item",
    );
    assert.equal(
      await nav.evaluate(
        (element) => element.scrollWidth === element.clientWidth,
      ),
      true,
      "active state does not introduce horizontal overflow",
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
  "Fixed mobile workspace navigation passed at 320, 375, 390, 393, and 430px for all role layouts, labels, clipping, touch geometry, active state, overflow, and desktop hiding.",
);
