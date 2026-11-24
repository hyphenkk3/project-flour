import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  classifySessionVerification,
  isTransientSessionVerificationError,
} from "../src/foundation/auth/session-errors.ts";

assert.equal(classifySessionVerification(true, null), "authenticated");
assert.equal(classifySessionVerification(false, null), "signed_out");
assert.equal(
  classifySessionVerification(false, { status: 401, message: "invalid token" }),
  "signed_out",
);
assert.equal(
  classifySessionVerification(false, {
    name: "AuthRetryableFetchError",
    status: 0,
    message: "fetch failed",
  }),
  "temporarily_unavailable",
);
assert.equal(
  classifySessionVerification(false, new DOMException("aborted", "AbortError")),
  "temporarily_unavailable",
);
assert.equal(
  classifySessionVerification(false, {
    status: 503,
    message: "service unavailable",
  }),
  "temporarily_unavailable",
);
assert.equal(
  classifySessionVerification(false, { status: 429, message: "rate limited" }),
  "temporarily_unavailable",
);
assert.equal(
  isTransientSessionVerificationError({
    name: "TypeError",
    message: "Failed to fetch",
  }),
  true,
);

const middleware = await readFile(
  new URL("../src/middleware.ts", import.meta.url),
  "utf8",
);
const session = await readFile(
  new URL("../src/foundation/auth/session.ts", import.meta.url),
  "utf8",
);
const sw = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const actions = await readFile(
  new URL("../src/foundation/auth/actions.ts", import.meta.url),
  "utf8",
);

assert.match(middleware, /status:\s*503/);
assert.match(middleware, /Cache-Control["']:\s*["']private, no-store/);
assert.match(
  middleware,
  /classifySessionVerification\(Boolean\(user\), error\)/,
);
assert.match(
  middleware,
  /if \(verification === "signed_out"\)[\s\S]*?staffLoginRedirect/,
);
assert.match(
  middleware,
  /catch \{[\s\S]*?sessionVerificationUnavailable\(request\)/,
);
assert.match(session, /throw new StaffSessionVerificationUnavailable\(\)/);
assert.match(session, /redirect\("\/auth\/session-check"\)/);
assert.match(
  session,
  /if \(!staff \|\| !staff\.isActive\)[\s\S]*?auth\.signOut\(\)/,
);
assert.equal((session.match(/auth\.signOut\(\)/g) ?? []).length, 1);
assert.match(actions, /async function logoutAction[\s\S]*?auth\.signOut\(\)/);
assert.doesNotMatch(actions, /localStorage\.clear|sessionStorage\.clear/);
assert.doesNotMatch(
  sw,
  /localStorage|sessionStorage|auth\.signOut|sb-[\w-]+-auth-token/,
);

console.log("AUTH_SESSION_VERIFICATION=PASS cases=20");
