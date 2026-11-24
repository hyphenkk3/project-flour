import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decideSessionResume } from "../src/foundation/auth/pwa-session-routing.ts";

const active = {
  authCookiePresent: true,
  auth: "verified",
  profile: "active",
};

// Valid session, including one restored through a refreshable access token.
assert.equal(
  decideSessionResume({ source: "pwa", ...active }),
  "staff_workspace",
);
assert.equal(
  decideSessionResume({ source: "login", ...active }),
  "staff_workspace",
);

// Missing cookies leave a customer launch on the public storefront.
assert.equal(
  decideSessionResume({
    source: "pwa",
    authCookiePresent: false,
    auth: "signed_out",
    profile: "not_checked",
  }),
  "public_home",
);
assert.equal(
  decideSessionResume({
    source: "login",
    authCookiePresent: false,
    auth: "signed_out",
    profile: "not_checked",
  }),
  "login",
);

// Invalid/expired refresh sessions and inactive or absent staff profiles fail closed.
assert.equal(
  decideSessionResume({
    source: "pwa",
    authCookiePresent: true,
    auth: "rejected",
    profile: "not_checked",
  }),
  "login",
);
assert.equal(
  decideSessionResume({
    source: "pwa",
    authCookiePresent: true,
    auth: "verified",
    profile: "inactive_or_missing",
  }),
  "login",
);

// Temporary Auth and staff-profile verification failures preserve retry behavior.
assert.equal(
  decideSessionResume({
    source: "pwa",
    authCookiePresent: true,
    auth: "temporarily_unavailable",
    profile: "not_checked",
  }),
  "retry",
);
assert.equal(
  decideSessionResume({
    source: "pwa",
    authCookiePresent: true,
    auth: "verified",
    profile: "unavailable",
  }),
  "retry",
);

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [
  manifest,
  middleware,
  resumeRoute,
  serverClient,
  session,
  login,
  checkPage,
  actions,
  serviceWorker,
  postLogin,
] = await Promise.all([
  read("../src/app/manifest.ts"),
  read("../src/middleware.ts"),
  read("../src/app/auth/session-resume/route.ts"),
  read("../src/lib/supabase/server.ts"),
  read("../src/foundation/auth/session.ts"),
  read("../src/app/login/page.tsx"),
  read("../src/app/auth/session-check/page.tsx"),
  read("../src/foundation/auth/actions.ts"),
  read("../public/sw.js"),
  read("../src/foundation/auth/post-login-destination.ts"),
]);

assert.match(manifest, /id:\s*["']\/["']/);
assert.match(manifest, /start_url:\s*["']\/?\?pwaLaunch=1["']/);
assert.match(manifest, /scope:\s*["']\/["']/);
assert.match(middleware, /searchParams\.get\("pwaLaunch"\) === "1"/);
assert.match(
  middleware,
  /const resumeUrl = new URL\("\/auth\/session-resume", request\.url\)/,
);
assert.match(middleware, /resumeUrl\.searchParams\.set\("from", "login"\)/);
assert.match(middleware, /hasSupabaseAuthCookie\(request\)/);
assert.match(middleware, /resumeChecked/);
assert.match(middleware, /if \(isPublicPath\(pathname\)/);
assert.match(resumeRoute, /getSessionStaff\(/);
assert.match(
  resumeRoute,
  /resolvePostLoginDestination\(staff\.role\.code, next\)/,
);
assert.match(resumeRoute, /STAFF_FORCED_PASSWORD_CHANGE_PATH/);
assert.match(resumeRoute, /private, no-store/);
assert.match(resumeRoute, /auth_cookie_present: authCookiePresent/);
assert.match(resumeRoute, /session_refresh: refreshOutcome/);
assert.match(resumeRoute, /staff_profile: profile/);
assert.match(resumeRoute, /tzwtpxdcggesgjaqxkqr\.supabase\.co/);
assert.match(resumeRoute, /VERCEL_ENV === "preview"/);
assert.match(resumeRoute, /VERCEL_ENV !== "production"/);
assert.doesNotMatch(
  resumeRoute,
  /console\.(?:log|info)\([^\n]*(?:cookie|token|secret|password)\s*:/i,
);
assert.match(serverClient, /cookieStore\.set\(name, value, cookieOptions\)/);
assert.match(serverClient, /onAuthCookieMutation\?\.\("written"\)/);
assert.match(session, /TOKEN_REFRESHED/);
assert.match(session, /"temporarily_unavailable"/);
assert.match(session, /"inactive_or_missing"/);
assert.match(postLogin, /const next = sanitizePostLoginPath\(requestedNext\)/);
assert.match(postLogin, /next && canAccessPostLoginPath\(role, next\)/);
assert.match(postLogin, /hasHomeAccess: canAccessWorkspace\(role, "home"\)/);
assert.match(login, /<LoginForm next=\{next\} \/>/);
assert.match(checkPage, /params\.retry === "pwa-launch"/);
assert.match(checkPage, /params\.retry === "login"/);
assert.match(actions, /async function logoutAction[\s\S]*?auth\.signOut\(\)/);
assert.doesNotMatch(actions, /localStorage\.clear|sessionStorage\.clear/);
assert.match(serviceWorker, /addEventListener\("push"/);
assert.match(serviceWorker, /addEventListener\("notificationclick"/);
assert.doesNotMatch(serviceWorker, /localStorage|sessionStorage|auth\.signOut/);

console.log(
  "PWA_SESSION_RESUME_LAUNCH=PASS diagnostics=dev_project_preview_only",
);
