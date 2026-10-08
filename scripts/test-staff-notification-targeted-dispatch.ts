import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStaffNotificationDispatchRouteHandlers } from "../src/foundation/staff/staff-notification-dispatch-route.ts";

const eventId = "20000000-0000-4000-8000-000000000001";
const staffId = "10000000-0000-4000-8000-000000000001";
const calls: Array<{ eventId?: string; staffId?: string }> = [];
let authorized = true;
const handlers = createStaffNotificationDispatchRouteHandlers({
  authorize: () =>
    authorized
      ? { ok: true }
      : { ok: false, status: 401, error: "Unauthorized." },
  deliver: async (scope) => {
    calls.push(scope);
    return [];
  },
});

function post(body?: string): Request {
  return new Request(
    "https://example.invalid/api/staff/notifications/dispatch",
    {
      method: "POST",
      ...(body === undefined
        ? {}
        : { body, headers: { "content-type": "application/json" } }),
    },
  );
}

const invalidRequests = [
  ["missing body", post()],
  ["malformed JSON", post("{")],
  ["missing event ID", post(JSON.stringify({ staffId }))],
  ["invalid event ID", post(JSON.stringify({ eventId: "bad", staffId }))],
  ["missing staff ID", post(JSON.stringify({ eventId }))],
  ["invalid staff ID", post(JSON.stringify({ eventId, staffId: "bad" }))],
  [
    "unexpected field",
    post(JSON.stringify({ eventId, staffId, global: true })),
  ],
] as const;

for (const [label, request] of invalidRequests) {
  const response = await handlers.POST(request);
  assert.equal(response.status, 400, `${label} should be rejected`);
  assert.deepEqual(
    calls,
    [],
    `${label} must not reach dispatch or a global sweep`,
  );
}

authorized = false;
const unauthorized = await handlers.POST(
  post(JSON.stringify({ eventId, staffId })),
);
authorized = true;
assert.equal(unauthorized.status, 401);
assert.deepEqual(calls, [], "unauthorized POST must not claim deliveries");

const valid = await handlers.POST(post(JSON.stringify({ eventId, staffId })));
assert.equal(valid.status, 200);
assert.deepEqual(calls, [{ eventId, staffId }]);

const getResponse = await handlers.GET(
  new Request("https://example.invalid/api/staff/notifications/dispatch"),
);
assert.equal(getResponse.status, 200);
assert.deepEqual(
  calls,
  [{ eventId, staffId }, {}],
  "authorized GET remains a global sweep",
);

const dispatchSource = readFileSync(
  "src/foundation/staff/staff-notification-dispatch.ts",
  "utf8",
);
const gateSource = readFileSync(
  "src/foundation/staff/staff-notification-email-dispatch-gate.ts",
  "utf8",
);
assert.match(
  dispatchSource,
  /claim_staff_notification_email_deliveries_for_staff/,
  "targeted requests use a distinct RPC name",
);
assert.match(
  dispatchSource,
  /claim_staff_notification_email_deliveries",\s*\{[\s\S]*?p_event_id:\s*input\.eventId\s*\?\?\s*null/,
  "global/event sweep keeps the existing three-argument RPC",
);
assert.match(
  gateSource,
  /staff_notification_email_dispatch_is_enabled/,
  "the app gate reads the database master gate",
);
assert.match(
  dispatchSource,
  /if \(!\(await isStaffNotificationEmailDispatchEnabled\(\)\)\) return \[\]/,
  "claiming fails closed before either RPC is selected",
);

console.log(
  "PASS: strict POST validation, unauthorized no-claim, targeted dispatch, GET sweep, and master-gate safeguards",
);
