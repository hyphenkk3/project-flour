import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { createServiceRoleFetch } from "@/lib/supabase/service-role-fetch";

const syntheticSecret = "sb_secret_synthetic_unit_test_key";
const legacyServiceJwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.synthetic";
const userJwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.synthetic";
const originalFetch = globalThis.fetch;
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};
const capturedLogs: string[] = [];
const originalEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://unit-test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = syntheticSecret;
globalThis.fetch = async (input, init) => {
  requests.push({ input, init });
  const path = new URL(typeof input === "string" || input instanceof URL ? input : input.url).pathname;
  return new Response(path.includes("/rpc/") ? "null" : "[]", {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

function recordedHeaders(index: number) {
  return new Headers(requests[index]?.init?.headers);
}

try {
  console.log = (...values) => capturedLogs.push(values.map(String).join(" "));
  console.warn = (...values) => capturedLogs.push(values.map(String).join(" "));
  console.error = (...values) => capturedLogs.push(values.map(String).join(" "));

  const serviceClient = createServiceClient();
  await serviceClient.rpc("submit_guest_extra_order_idempotent_v3", {
    p_request_id: "synthetic-request-id",
  });

  assert.equal(requests.length, 1, "the RPC makes one request");
  assert.equal(new URL(String(requests[0].input)).pathname,
    "/rest/v1/rpc/submit_guest_extra_order_idempotent_v3");
  assert.equal(requests[0].init?.method, "POST");
  assert.equal(recordedHeaders(0).get("apikey"), syntheticSecret);
  assert.equal(recordedHeaders(0).has("authorization"), false);
  assert.match(String(requests[0].init?.body), /synthetic-request-id/);

  await serviceClient.from("synthetic_table").select("id").limit(1);
  assert.equal(requests.length, 2, "a normal PostgREST read remains compatible");
  assert.equal(new URL(String(requests[1].input)).pathname, "/rest/v1/synthetic_table");
  assert.equal(recordedHeaders(1).get("apikey"), syntheticSecret);
  assert.equal(recordedHeaders(1).has("authorization"), false);
  assert.equal(requests[1].init?.method, "GET");

  const legacyRequests: Array<RequestInit | undefined> = [];
  globalThis.fetch = async (_input, init) => {
    legacyRequests.push(init);
    return new Response("null", { status: 200, headers: { "content-type": "application/json" } });
  };
  process.env.SUPABASE_SERVICE_ROLE_KEY = legacyServiceJwt;
  const legacyClient = createServiceClient();
  await legacyClient.rpc("legacy_compatibility_check", {});
  const legacyHeaders = new Headers(legacyRequests[0]?.headers);
  assert.equal(legacyHeaders.get("apikey"), legacyServiceJwt);
  assert.equal(legacyHeaders.get("authorization"), `Bearer ${legacyServiceJwt}`);

  const explicitHeaders: Headers[] = [];
  let explicitRequest: RequestInit | undefined;
  const explicitClient = createClient("https://unit-test.supabase.co", syntheticSecret, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${userJwt}` },
      fetch: createServiceRoleFetch(syntheticSecret, async (_input, init) => {
        explicitRequest = init;
        explicitHeaders.push(new Headers(init?.headers));
        return new Response("null", {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }),
    },
  });
  const explicitResult = await explicitClient.rpc("explicit_authorization_check", {
    unchanged: true,
  });
  assert.equal(explicitHeaders[0].get("apikey"), syntheticSecret);
  assert.equal(explicitHeaders[0].get("authorization"), `Bearer ${userJwt}`);
  assert.equal(explicitHeaders[0].get("content-type"), "application/json");
  assert.equal(explicitRequest?.method, "POST");
  assert.match(String(explicitRequest?.body), /\"unchanged\":true/);
  assert.equal(explicitResult.status, 201);
  assert.equal(explicitResult.error, null);

  const fallbackHeaders: Headers[] = [];
  const fallbackFetch = createServiceRoleFetch(syntheticSecret, async (_input, init) => {
    fallbackHeaders.push(new Headers(init?.headers));
    return new Response("ok");
  });
  await fallbackFetch("https://unit-test.supabase.co/rest/v1/rpc/check", {
    method: "POST",
    headers: { Authorization: `bEaReR ${syntheticSecret}` },
  });
  assert.equal(fallbackHeaders[0].get("apikey"), syntheticSecret);
  assert.equal(fallbackHeaders[0].has("authorization"), false);

  const diagnostics = [syntheticSecret, legacyServiceJwt, userJwt];
  assert.equal(JSON.stringify({
    requestCount: requests.length,
    methods: requests.map(({ init }) => init?.method),
  }).includes(syntheticSecret), false);
  assert.equal(diagnostics.every((secret) => !JSON.stringify({
    result: explicitResult.data,
    status: explicitResult.status,
    requestCount: requests.length,
  }).includes(secret)), true);
  assert.equal(explicitResult.data, null);
  assert.equal(diagnostics.some((secret) => capturedLogs.join("\n").includes(secret)), false);

  const failedFetch = createServiceRoleFetch(syntheticSecret, async () => {
    throw new Error("Synthetic network failure");
  });
  await assert.rejects(
    () => failedFetch("https://unit-test.supabase.co/rest/v1/rpc/check"),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.equal(diagnostics.some((secret) => String(error).includes(secret)), false);
      return true;
    },
  );

  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.log("SUPABASE_SERVICE_KEY_TRANSPORT=PASS");
  console.log("secret_key_rpc=apikey_only; legacy_jwt=bearer_compatible; explicit_user_authorization=preserved");
  console.log("postgrest_read=compatible; request_method_body_content_type=preserved; secret_output=none");
} finally {
  globalThis.fetch = originalFetch;
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  if (originalEnv.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.url;
  if (originalEnv.anonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalEnv.anonKey;
  if (originalEnv.serviceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.serviceRoleKey;
}
