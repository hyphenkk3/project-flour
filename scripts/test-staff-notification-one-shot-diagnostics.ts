import assert from "node:assert/strict";

import {
  executeOneShotStaffNotificationEmailTest,
  type OneShotTestDependencies,
} from "../src/foundation/staff/staff-notification-one-shot-test";

const ids = {
  scopeId: "10000000-0000-4000-8000-000000000001",
  eventId: "20000000-0000-4000-8000-000000000001",
  staffId: "30000000-0000-4000-8000-000000000001",
};

const devEnv = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "debug/mobile-add-to-order-safari",
  NEXT_PUBLIC_SUPABASE_URL: "https://tzwtpxdcggesgjaqxkqr.supabase.co",
  RESEND_API_KEY: "synthetic-key-never-sent",
  RESEND_FROM: "Test <test@example.invalid>",
} as NodeJS.ProcessEnv;

const claimedRow = {
  delivery_id: "40000000-0000-4000-8000-000000000001",
  event_id: ids.eventId,
  staff_id: ids.staffId,
  staff_email: "recipient@example.invalid",
  claimed_until: "2026-10-09T00:02:00.000Z",
  event_key: "one-shot:synthetic",
  code: "order_paid",
  title: "Synthetic notification",
  description: "Synthetic test only",
  href: null,
  payload: null,
  order_id: null,
};

type RpcOverride = (
  name: string,
  callCount: number,
) => { data: unknown; error: boolean } | undefined;

async function runCase(
  input: {
    env?: NodeJS.ProcessEnv;
    rpcOverride?: RpcOverride;
    row?: typeof claimedRow;
    sendProvider?: OneShotTestDependencies["sendProvider"];
  } = {},
) {
  const calls = new Map<string, number>();
  let providerCalls = 0;
  const rpc: NonNullable<OneShotTestDependencies["rpc"]> = async (
    name,
    args,
  ) => {
    void args;
    const count = (calls.get(name) ?? 0) + 1;
    calls.set(name, count);
    const override = input.rpcOverride?.(name, count);
    if (override) return override;
    if (name === "staff_notification_email_test_scope_is_armed") {
      return { data: true, error: false };
    }
    if (name === "claim_staff_notification_email_test_delivery") {
      return { data: [input.row ?? claimedRow], error: false };
    }
    if (name === "staff_notification_email_test_scope_is_current") {
      return { data: true, error: false };
    }
    if (name === "staff_notification_fresh_pick_hold_reminder_is_current") {
      return { data: true, error: false };
    }
    if (name === "authorize_staff_notification_email_test_provider_attempt") {
      return { data: true, error: false };
    }
    return { data: true, error: false };
  };
  const result = await executeOneShotStaffNotificationEmailTest(ids, {
    env: input.env ?? devEnv,
    rpc,
    sendProvider: async () => {
      providerCalls += 1;
      return { id: "synthetic-provider-id" };
    },
  });
  return { result, calls, providerCalls };
}

async function main() {
  const cases: Array<{
    name: string;
    expected: string;
    input?: Parameters<typeof runCase>[0];
  }> = [
    {
      name: "deployment_not_allowed",
      expected: "deployment_not_allowed",
      input: { env: { ...devEnv, VERCEL_ENV: "production" } },
    },
    {
      name: "provider_api_key_missing",
      expected: "provider_api_key_missing",
      input: { env: { ...devEnv, RESEND_API_KEY: " " } },
    },
    {
      name: "provider_sender_missing",
      expected: "provider_sender_missing",
      input: { env: { ...devEnv, RESEND_FROM: " " } },
    },
    {
      name: "scope_check_error",
      expected: "scope_check_error",
      input: {
        rpcOverride: (name) => {
          if (name === "staff_notification_email_test_scope_is_armed") {
            throw new Error("SENSITIVE_DATABASE_DETAIL");
          }
          return undefined;
        },
      },
    },
    {
      name: "scope_not_armed_or_gate_closed",
      expected: "scope_not_armed_or_gate_closed",
      input: {
        rpcOverride: (name) =>
          name === "staff_notification_email_test_scope_is_armed"
            ? { data: false, error: false }
            : undefined,
      },
    },
    {
      name: "claim_rpc_error",
      expected: "claim_rpc_error",
      input: {
        rpcOverride: (name) =>
          name === "claim_staff_notification_email_test_delivery"
            ? { data: null, error: true }
            : undefined,
      },
    },
    {
      name: "claim_result_mismatch",
      expected: "claim_result_mismatch",
      input: {
        row: {
          ...claimedRow,
          staff_id: "50000000-0000-4000-8000-000000000001",
        },
      },
    },
    {
      name: "scope_check_error_after_claim",
      expected: "scope_check_error_after_claim",
      input: {
        rpcOverride: (name) =>
          name === "staff_notification_email_test_scope_is_current"
            ? { data: null, error: true }
            : undefined,
      },
    },
    {
      name: "scope_not_current_before_recipient_processing",
      expected: "scope_not_current_before_recipient_processing",
      input: {
        rpcOverride: (name) =>
          name === "staff_notification_email_test_scope_is_current"
            ? { data: false, error: false }
            : undefined,
      },
    },
    {
      name: "one_shot_audit_error",
      expected: "one_shot_audit_error",
      input: {
        rpcOverride: (name) =>
          name === "complete_staff_notification_email_test_provider_attempt"
            ? { data: null, error: true }
            : name === "staff_notification_email_test_scope_is_current"
              ? { data: false, error: false }
              : undefined,
      },
    },
    {
      name: "fresh_pick_check_error",
      expected: "fresh_pick_check_error",
      input: {
        row: { ...claimedRow, code: "fresh_pick_walk_in_hold_reminder" },
        rpcOverride: (name) =>
          name === "staff_notification_fresh_pick_hold_reminder_is_current"
            ? { data: null, error: true }
            : undefined,
      },
    },
    {
      name: "fresh_pick_hold_not_current",
      expected: "fresh_pick_hold_not_current",
      input: {
        row: { ...claimedRow, code: "fresh_pick_walk_in_hold_reminder" },
        rpcOverride: (name) =>
          name === "staff_notification_fresh_pick_hold_reminder_is_current"
            ? { data: false, error: false }
            : undefined,
      },
    },
    {
      name: "scope_check_error_before_provider_authorization",
      expected: "scope_check_error_before_provider_authorization",
      input: {
        rpcOverride: (name, count) =>
          name === "staff_notification_email_test_scope_is_current" &&
          count === 2
            ? { data: null, error: true }
            : undefined,
      },
    },
    {
      name: "scope_not_current_before_provider_authorization",
      expected: "scope_not_current_before_provider_authorization",
      input: {
        rpcOverride: (name, count) =>
          name === "staff_notification_email_test_scope_is_current" &&
          count === 2
            ? { data: false, error: false }
            : undefined,
      },
    },
    {
      name: "provider_authorization_error",
      expected: "provider_authorization_error",
      input: {
        rpcOverride: (name) =>
          name === "authorize_staff_notification_email_test_provider_attempt"
            ? { data: null, error: true }
            : undefined,
      },
    },
    {
      name: "provider_authorization_denied",
      expected: "provider_authorization_denied",
      input: {
        rpcOverride: (name) =>
          name === "authorize_staff_notification_email_test_provider_attempt"
            ? { data: false, error: false }
            : undefined,
      },
    },
  ];

  for (const item of cases) {
    const result = await runCase(item.input ?? {});
    assert.deepEqual(
      result.result,
      {
        outcome: "blocked",
        reason: item.expected,
      },
      item.name,
    );
    assert.equal(
      JSON.stringify(result.result).includes("SENSITIVE_DATABASE_DETAIL"),
      false,
      "diagnostics must not echo database error detail",
    );
    assert.equal(
      result.providerCalls,
      0,
      `${item.name} must not call provider`,
    );
  }

  const success = await runCase();
  assert.deepEqual(success.result, {
    outcome: "accepted",
    providerRequestId: "synthetic-provider-id",
  });
  assert.equal(success.providerCalls, 1, "success uses exactly one mock send");

  const noEligibleRow = await runCase({
    rpcOverride: (name) =>
      name === "claim_staff_notification_email_test_delivery"
        ? { data: [], error: false }
        : undefined,
  });
  assert.deepEqual(noEligibleRow.result, { outcome: "not_eligible" });
  assert.equal(noEligibleRow.providerCalls, 0);

  console.log(
    `One-shot diagnostic tests passed (${cases.length} blocked reasons; mock provider only).`,
  );
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "One-shot diagnostic test failed.",
  );
  process.exitCode = 1;
});
