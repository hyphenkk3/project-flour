import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  diagnosticEnvironmentAllowed,
  diagnosticOwnerAllowed,
  diagnosticSameOriginAllowed,
  DEV_SERVICE_ROLE_CHECK_BRANCH,
  DEV_SERVICE_ROLE_CHECK_URL,
  verifyDevServiceRoleCredential,
} from "../src/foundation/staff/dev-service-role-verification.ts";

const validEnv = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: DEV_SERVICE_ROLE_CHECK_BRANCH,
  NEXT_PUBLIC_SUPABASE_URL: DEV_SERVICE_ROLE_CHECK_URL,
};

test("diagnostic accepts only the exact DEV Preview branch and URL", () => {
  assert.equal(diagnosticEnvironmentAllowed(validEnv), true);
  assert.equal(
    diagnosticEnvironmentAllowed({ ...validEnv, VERCEL_ENV: "production" }),
    false,
  );
  assert.equal(
    diagnosticEnvironmentAllowed({
      ...validEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://cuowwlduhxxifmpvpltt.supabase.co",
    }),
    false,
  );
  assert.equal(
    diagnosticEnvironmentAllowed({
      ...validEnv,
      VERCEL_GIT_COMMIT_REF: "main",
    }),
    false,
  );
});

test("diagnostic is unavailable after its fixed expiry", () => {
  assert.equal(
    diagnosticEnvironmentAllowed(
      validEnv,
      Date.parse("2026-11-10T15:30:00+08:00"),
    ),
    false,
  );
});

test("only an active Master Owner is authorized", () => {
  assert.equal(
    diagnosticOwnerAllowed({
      isActive: true,
      isMasterOwner: true,
      role: { code: "owner" },
    }),
    true,
  );
  assert.equal(diagnosticOwnerAllowed(null), false);
  assert.equal(
    diagnosticOwnerAllowed({
      isActive: false,
      isMasterOwner: true,
      role: { code: "owner" },
    }),
    false,
  );
  assert.equal(
    diagnosticOwnerAllowed({
      isActive: true,
      isMasterOwner: false,
      role: { code: "owner" },
    }),
    false,
  );
});

test("same-origin authorization rejects missing and foreign origins", () => {
  assert.equal(
    diagnosticSameOriginAllowed("https://preview.test", "https://preview.test"),
    true,
  );
  assert.equal(
    diagnosticSameOriginAllowed(null, "https://preview.test"),
    false,
  );
  assert.equal(
    diagnosticSameOriginAllowed("https://evil.test", "https://preview.test"),
    false,
  );
});

test("missing credentials fail without making a request", async () => {
  let calls = 0;
  const outcome = await verifyDevServiceRoleCredential(undefined, async () => {
    calls += 1;
    throw new Error("must not be called");
  });
  assert.equal(outcome, "FAIL");
  assert.equal(calls, 0);
});

test("verification makes one fixed-host zero-row HEAD and returns only PASS", async () => {
  let calls = 0;
  const outcome = await verifyDevServiceRoleCredential(
    "synthetic-service-key",
    async (input, init) => {
      calls += 1;
      assert.equal(
        String(input),
        `${DEV_SERVICE_ROLE_CHECK_URL}/rest/v1/staff_notification_push_subscriptions?select=id&limit=0`,
      );
      assert.equal(init?.method, "HEAD");
      assert.equal(init?.body, undefined);
      assert.equal(
        new Headers(init?.headers).get("apikey"),
        "synthetic-service-key",
      );
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer synthetic-service-key",
      );
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.redirect, "error");
      return new Response(null, { status: 200 });
    },
  );
  assert.equal(outcome, "PASS");
  assert.equal(calls, 1);
  assert.equal(
    JSON.stringify({ outcome }).includes("synthetic-service-key"),
    false,
  );
});

test("secret API-key format is not sent as a Bearer token", async () => {
  const outcome = await verifyDevServiceRoleCredential(
    "sb_secret_synthetic",
    async (_input, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("apikey"), "sb_secret_synthetic");
      assert.equal(headers.has("authorization"), false);
      return new Response(null, { status: 200 });
    },
  );
  assert.equal(outcome, "PASS");
});

test("authorization failures fail and ambiguous transport failures hold without retry", async () => {
  assert.equal(
    await verifyDevServiceRoleCredential(
      "synthetic",
      async () => new Response(null, { status: 403 }),
    ),
    "FAIL",
  );
  let calls = 0;
  assert.equal(
    await verifyDevServiceRoleCredential("synthetic", async () => {
      calls += 1;
      throw new Error("ambiguous transport failure");
    }),
    "HOLD",
  );
  assert.equal(calls, 1);
});

test("route and helper contain no writes, dispatch calls, email calls, or secret logging", async () => {
  const route = await readFile(
    new URL(
      "../src/app/api/staff/internal/dev-service-role-check/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const helper = await readFile(
    new URL(
      "../src/foundation/staff/dev-service-role-verification.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const source = `${route}\n${helper}`;
  assert.match(route, /getSessionStaff/);
  assert.match(route, /diagnosticOwnerAllowed/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(
    source,
    /deliverPendingStaffPushNotifications|resend|sendEmail|console\.(log|error)/i,
  );
  assert.match(
    helper,
    /staff_notification_push_subscriptions\?select=id&limit=0/,
  );
});
