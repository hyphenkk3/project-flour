import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { decideSessionResume } from "../src/foundation/auth/pwa-session-routing.ts";

const script = await readFile(
  new URL("../public/pwa-legacy-launch.js", import.meta.url),
  "utf8",
);

function run({
  href = "https://dev.whitebird.asia/",
  ios = false,
  displayMode = false,
} = {}) {
  const url = new URL(href);
  const state = { redirects: [], timers: [], visibility: "visible" };
  const window = {
    location: {
      origin: url.origin,
      pathname: url.pathname,
      search: url.search,
      replace: (target) => state.redirects.push(target),
    },
    matchMedia: () => ({ matches: displayMode }),
    setTimeout: (fn) => state.timers.push(fn),
    __whitebirdLegacyPwaResumeStarted: false,
  };
  const documentElement = { style: { visibility: state.visibility } };
  const context = {
    window,
    navigator: { standalone: ios },
    document: { documentElement },
    URL,
    URLSearchParams,
  };
  vm.runInNewContext(script, context);
  return { state, window, context, documentElement };
}

for (const [signal, options] of [
  ["ios", { ios: true }],
  ["display-mode", { displayMode: true }],
  ["both", { ios: true, displayMode: true }],
]) {
  const { state, documentElement } = run(options);
  assert.deepEqual(state.redirects, [
    `/auth/session-resume?from=legacy-pwa&standaloneSignal=${signal}`,
  ]);
  assert.equal(documentElement.style.visibility, "hidden");
}

for (const options of [
  {},
  { href: "https://dev.whitebird.asia/catalog", ios: true },
  { href: "https://dev.whitebird.asia/?pwaLaunch=1", ios: true },
  { href: "https://dev.whitebird.asia/?pwaResumeChecked=1", ios: true },
]) {
  assert.equal(run(options).state.redirects.length, 0);
}
assert.equal(
  run({ href: "https://dev.whitebird.asia/?next=pwaLaunch%3D1", ios: true })
    .state.redirects.length,
  1,
);

const repeated = run({ ios: true });
vm.runInNewContext(script, repeated.context);
assert.equal(repeated.state.redirects.length, 1);

const request = (source, authCookiePresent, auth, profile) =>
  decideSessionResume({ source, authCookiePresent, auth, profile });
assert.equal(
  request("legacy_pwa", true, "verified", "active"),
  "staff_workspace",
);
assert.equal(
  request("legacy_pwa", true, "temporarily_unavailable", "not_checked"),
  "retry",
);
assert.equal(
  request("legacy_pwa", false, "signed_out", "not_checked"),
  "public_home",
);
assert.equal(request("legacy_pwa", true, "rejected", "not_checked"), "login");
assert.equal(
  request("legacy_pwa", true, "verified", "inactive_or_missing"),
  "login",
);
assert.equal(request("pwa", false, "signed_out", "not_checked"), "public_home");
assert.equal(request("login", false, "signed_out", "not_checked"), "login");

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [layout, manifest, middleware, route, sessionCheck, sw] =
  await Promise.all([
    read("../src/app/layout.tsx"),
    read("../src/app/manifest.ts"),
    read("../src/middleware.ts"),
    read("../src/app/auth/session-resume/route.ts"),
    read("../src/app/auth/session-check/page.tsx"),
    read("../public/sw.js"),
  ]);

assert.match(layout, /pwa-legacy-launch\.js.*beforeInteractive/);
assert.match(manifest, /id:\s*["']\/["']/);
assert.match(manifest, /start_url:\s*["']\/?\?pwaLaunch=1["']/);
assert.match(manifest, /scope:\s*["']\/["']/);
assert.match(middleware, /searchParams\.get\("pwaLaunch"\) === "1"/);
assert.match(route, /getSessionStaff\(/);
assert.match(route, /from === "legacy-pwa" \? "legacy_pwa"/);
assert.match(route, /\?pwaResumeChecked=1/);
assert.match(route, /retry=pwa-legacy/);
assert.match(sessionCheck, /params\.retry === "pwa-legacy"/);
assert.match(sw, /addEventListener\("push"/);
assert.match(sw, /addEventListener\("notificationclick"/);

console.log(
  "PWA_LEGACY_LAUNCH=PASS ios=PASS display_mode=PASS ordinary_browser=PASS customer_fallback=PASS retry=PASS loop_guard=PASS manifest_identity=preserved",
);
