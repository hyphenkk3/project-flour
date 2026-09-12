/**
 * Staff Passkey login/registration helpers.
 * Run: npx tsx scripts/test-staff-passkeys.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PASSKEY_COPY,
  browserSupportsPasskeySignIn,
  classifyPasskeyFailure,
  formatPasskeyAddedAt,
  isNextRedirectError,
  passkeyCeremonyFailureMessage,
  passkeySetupMessage,
  passkeySignInMessage,
} from "@/foundation/auth/passkeys";

assert.equal(classifyPasskeyFailure({ name: "AbortError" }), "cancelled");
assert.equal(classifyPasskeyFailure({ name: "NotAllowedError" }), "cancelled");
assert.equal(
  classifyPasskeyFailure({ code: "ERROR_CEREMONY_ABORTED" }),
  "cancelled",
);
assert.equal(
  classifyPasskeyFailure({ message: "The operation was cancelled." }),
  "cancelled",
);
assert.equal(
  classifyPasskeyFailure({ name: "NotSupportedError" }),
  "unsupported",
);
assert.equal(
  classifyPasskeyFailure({ message: "Browser does not support WebAuthn" }),
  "unsupported",
);
assert.equal(
  classifyPasskeyFailure({ message: "webauthn_verification_failed" }),
  "failed",
);

assert.equal(
  passkeySignInMessage("cancelled"),
  PASSKEY_COPY.cancelledSignIn,
);
assert.equal(passkeySignInMessage("unsupported"), PASSKEY_COPY.unsupported);
assert.equal(passkeySignInMessage("failed"), PASSKEY_COPY.failedSignIn);
assert.equal(passkeySetupMessage("cancelled"), PASSKEY_COPY.cancelledSetup);

assert.equal(browserSupportsPasskeySignIn({} as typeof globalThis), false);
assert.match(
  formatPasskeyAddedAt("2026-09-11T08:00:00.000Z"),
  /^Added 11 Sep/,
);

assert.equal(
  isNextRedirectError({ digest: "NEXT_REDIRECT;push;/home;307;" }),
  true,
);
assert.equal(isNextRedirectError({ message: "NEXT_REDIRECT" }), true);
assert.equal(isNextRedirectError({ message: "webauthn_verification_failed" }), false);

assert.equal(
  passkeyCeremonyFailureMessage({
    hasAuthenticatedUser: true,
    ceremonyError: { digest: "NEXT_REDIRECT;push;/home;307;" },
  }),
  null,
);
assert.equal(
  passkeyCeremonyFailureMessage({
    hasAuthenticatedUser: true,
    ceremonyError: { message: PASSKEY_COPY.failedSignIn },
  }),
  null,
);
assert.equal(
  passkeyCeremonyFailureMessage({
    hasAuthenticatedUser: false,
    ceremonyError: { name: "AbortError" },
  }),
  PASSKEY_COPY.cancelledSignIn,
);
assert.equal(
  passkeyCeremonyFailureMessage({
    hasAuthenticatedUser: false,
    ceremonyError: { message: "webauthn_verification_failed" },
  }),
  PASSKEY_COPY.failedSignIn,
);

const actionsSource = readFileSync(
  resolve("src/foundation/auth/actions.ts"),
  "utf8",
);
assert.match(actionsSource, /signInWithPassword/);
assert.match(actionsSource, /completePasskeyLoginAction/);
assert.match(actionsSource, /getSessionStaff/);
assert.match(actionsSource, /resolvePostLoginDestination/);
assert.match(actionsSource, /staff\.mustChangePassword/);
assert.match(actionsSource, /STAFF_FORCED_PASSWORD_CHANGE_PATH/);
assert.match(actionsSource, /ok:\s*true/);
assert.match(
  actionsSource,
  /completePasskeyLoginAction[\s\S]*resolvePostLoginDestination/,
);
assert.doesNotMatch(actionsSource, /signInWithPasskey/);
assert.doesNotMatch(
  actionsSource,
  /completePasskeyLoginAction[\s\S]*redirect\(/,
);

const loginFormSource = readFileSync(
  resolve("src/components/LoginForm.tsx"),
  "utf8",
);
assert.match(loginFormSource, /loginAction/);
assert.match(loginFormSource, /signInWithPasskey/);
assert.match(loginFormSource, /Sign in with Passkey/);
assert.doesNotMatch(loginFormSource, /Face ID/);
assert.doesNotMatch(loginFormSource, /Touch ID/);
assert.doesNotMatch(loginFormSource, /Biometric Login/);
assert.match(loginFormSource, /completePasskeyLoginAction/);
assert.match(loginFormSource, /classifyPasskeyFailure/);
assert.match(loginFormSource, /passkeySignInMessage/);
assert.match(loginFormSource, /passkeyCeremonyFailureMessage/);
assert.match(loginFormSource, /auth\.getUser\(\)/);
assert.match(loginFormSource, /location\.replace\(result\.destination\)/);
assert.match(loginFormSource, /isNextRedirectError/);
assert.doesNotMatch(loginFormSource, /result\?\.error/);

const clientSource = readFileSync(
  resolve("src/lib/supabase/client.ts"),
  "utf8",
);
assert.match(clientSource, /experimental:\s*\{\s*passkey:\s*true/);

const serverSource = readFileSync(
  resolve("src/lib/supabase/server.ts"),
  "utf8",
);
assert.doesNotMatch(serverSource, /signInWithPasskey/);
assert.doesNotMatch(serverSource, /registerPasskey/);

const sessionSource = readFileSync(
  resolve("src/foundation/auth/session.ts"),
  "utf8",
);
assert.match(sessionSource, /export async function requireStaff/);
assert.match(sessionSource, /getStaffByAuthUserId/);
assert.match(sessionSource, /!staff\.isActive/);

const settingsPage = readFileSync(
  resolve("src/app/(app)/settings/page.tsx"),
  "utf8",
);
assert.match(settingsPage, /requireStaff/);
assert.match(settingsPage, /StaffPasskeySettings/);

const settingsSource = readFileSync(
  resolve("src/components/settings/StaffPasskeySettings.tsx"),
  "utf8",
);
assert.match(settingsSource, /registerPasskey/);
assert.match(settingsSource, /passkey\.list/);
assert.match(settingsSource, /passkey\.delete/);
assert.match(settingsSource, /getUser/);

const browse = readFileSync(
  resolve("src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx"),
  "utf8",
);
assert.doesNotMatch(browse, /registerPasskey|Sign in with Passkey/);

const loginPage = readFileSync(resolve("src/app/login/page.tsx"), "utf8");
assert.match(loginPage, /LoginForm next=\{next\}/);

console.log("test-staff-passkeys: PASS");
