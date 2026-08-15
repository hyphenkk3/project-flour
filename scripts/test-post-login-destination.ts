/**
 * Post-login default landing resolver.
 * Run: npx tsx scripts/test-post-login-destination.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canAccessPostLoginPath,
  pickDefaultPostLoginDestination,
  resolvePostLoginDestination,
  sanitizePostLoginPath,
} from "@/foundation/auth/post-login-destination";
import { canAccessWorkspace } from "@/foundation/navigation/access";
import { getNavigationForRole } from "@/foundation/navigation/workspaces";

// --- Defaults: Home for roles that have Home ---
assert.equal(resolvePostLoginDestination("owner"), "/home");
assert.equal(resolvePostLoginDestination("manager"), "/home");
assert.equal(resolvePostLoginDestination("customer_operations"), "/home");
assert.equal(resolvePostLoginDestination("bakery"), "/home");
assert.equal(resolvePostLoginDestination("collection"), "/home");

assert.equal(canAccessWorkspace("owner", "home"), true);
assert.equal(canAccessWorkspace("manager", "home"), true);
assert.equal(canAccessWorkspace("customer_operations", "home"), true);

// --- Explicit authorized return destination is preserved ---
assert.equal(
  resolvePostLoginDestination("owner", "/owner/calendar"),
  "/owner/calendar",
);
assert.equal(
  resolvePostLoginDestination("manager", "/owner?pickup=today"),
  "/owner?pickup=today",
);
assert.equal(
  resolvePostLoginDestination(
    "customer_operations",
    "/customer-operations/customers",
  ),
  "/customer-operations/customers",
);
assert.equal(
  resolvePostLoginDestination("owner", "/owner/orders/abc-123"),
  "/owner/orders/abc-123",
);

// --- Unauthorized / unsafe next falls back to default ---
assert.equal(
  resolvePostLoginDestination("bakery", "/owner/calendar"),
  "/home",
);
assert.equal(
  resolvePostLoginDestination("collection", "/owner"),
  "/home",
);
assert.equal(resolvePostLoginDestination("owner", "https://evil.example"), "/home");
assert.equal(resolvePostLoginDestination("owner", "//evil.example"), "/home");
assert.equal(resolvePostLoginDestination("owner", "/login"), "/home");
assert.equal(resolvePostLoginDestination("owner", null), "/home");
assert.equal(resolvePostLoginDestination("owner", ""), "/home");

// --- Role without Home access must not land on /home ---
assert.equal(
  pickDefaultPostLoginDestination({
    hasHomeAccess: false,
    fallbackHref: "/bakery",
  }),
  "/bakery",
);
assert.notEqual(
  pickDefaultPostLoginDestination({
    hasHomeAccess: false,
    fallbackHref: "/collection",
  }),
  "/home",
);

// --- Path helpers ---
assert.equal(sanitizePostLoginPath("/owner/calendar"), "/owner/calendar");
assert.equal(sanitizePostLoginPath("//evil"), null);
assert.equal(canAccessPostLoginPath("bakery", "/bakery"), true);
assert.equal(canAccessPostLoginPath("bakery", "/owner"), false);

// --- Wiring: loginAction uses resolver; Owner hard-code removed ---
const actionsSource = readFileSync(
  resolve("src/foundation/auth/actions.ts"),
  "utf8",
);
assert.match(actionsSource, /resolvePostLoginDestination/);
assert.doesNotMatch(
  actionsSource,
  /roleCode === ["']owner["']\s*\?\s*["']\/owner["']/,
);
assert.match(actionsSource, /formData\.get\(["']next["']\)/);

const loginFormSource = readFileSync(
  resolve("src/components/LoginForm.tsx"),
  "utf8",
);
assert.match(loginFormSource, /name="next"/);

const loginPageSource = readFileSync(
  resolve("src/app/login/page.tsx"),
  "utf8",
);
assert.match(loginPageSource, /sanitizePostLoginPath/);
assert.match(loginPageSource, /LoginForm next=\{next\}/);

// Navigation catalog unchanged for Home-first roles
assert.equal(getNavigationForRole("owner")[0]?.id, "home");
assert.equal(getNavigationForRole("manager")[0]?.id, "home");
assert.equal(getNavigationForRole("customer_operations")[0]?.id, "home");

console.log("test-post-login-destination: PASS");
