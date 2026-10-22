import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  checkoutSubmissionPayload,
  createCheckoutRequestId,
  isCheckoutRequestId,
} from "@/workspaces/storefront/checkout/checkout-attempt";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const requestId = createCheckoutRequestId();
assert.ok(isCheckoutRequestId(requestId), "new attempts use opaque UUIDs");
assert.equal(isCheckoutRequestId("not-a-uuid"), false);

const form = new FormData();
form.set("checkout_request_id", requestId);
form.set("perf_correlation_id", "transient-correlation-id");
form.set("customer_name", "Synthetic Customer");
form.set("pickup_date", "2026-10-24");
form.append("item", "cake-a");
form.append("item", "cake-b");
form.set("$ACTION_ID", "framework-generated");

const payload = checkoutSubmissionPayload(form);
assert.deepEqual(payload.item, ["cake-a", "cake-b"]);
assert.equal(payload.checkout_request_id, undefined);
assert.equal(payload.perf_correlation_id, undefined);
assert.equal(payload.$ACTION_ID, undefined);
assert.deepEqual(payload, checkoutSubmissionPayload(form));

const changedForm = new FormData();
for (const [name, value] of form.entries()) changedForm.append(name, value);
changedForm.set("pickup_date", "2026-10-25");
assert.notDeepEqual(payload, checkoutSubmissionPayload(changedForm));

const checkoutAction = read("src/workspaces/storefront/checkout/actions.ts");
const freshPickAction = read("src/workspaces/storefront/extra/actions.ts");
const migration = read(
  "supabase/migrations/20261022012610_guest_checkout_idempotency.sql",
);
const recoveryMigration = read(
  "supabase/migrations/20261022042322_checkout_receipt_recovery_capability.sql",
);
const recoveryServer = read(
  "src/workspaces/storefront/checkout/checkout-recovery.ts",
);
const recoveryRoute = read("src/app/api/guest-checkout/recovery/route.ts");
const recoveryClient = read(
  "src/workspaces/storefront/checkout/checkout-recovery-client.ts",
);

assert.match(checkoutAction, /submit_guest_preorder_idempotent/);
assert.match(checkoutAction, /submit_guest_preorder_with_catalogue_voucher_idempotent/);
assert.match(freshPickAction, /submit_guest_extra_order_idempotent/);
assert.match(checkoutAction, /isCheckoutRequestId\(data\)/);
assert.match(freshPickAction, /isCheckoutRequestId\(data\)/);
assert.match(checkoutAction, /resolveCheckoutAttempt\(formData, "whole_cake"\)/);
assert.match(freshPickAction, /resolveCheckoutAttempt\(formData, "fresh_pick"\)/);
assert.match(checkoutAction, /submit_guest_preorder_idempotent_v3/);
assert.match(checkoutAction, /submit_guest_preorder_with_catalogue_voucher_idempotent_v3/);
assert.match(freshPickAction, /submit_guest_extra_order_idempotent_v3/);
assert.match(checkoutAction, /createServiceClient\(\)/);
assert.match(freshPickAction, /createServiceClient\(\)/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /submission_digest bytea not null/);
assert.match(migration, /rpc_digest bytea not null/);
assert.match(migration, /primary key/);
assert.match(migration, /from public, anon, authenticated/);
assert.match(migration, /does not store.*customer|only hashes/i);
const responseMigration = read(
  "supabase/migrations/20261022014009_guest_checkout_idempotency_safe_response.sql",
);
assert.match(responseMigration, /submit_guest_preorder_idempotent_v2[\s\S]*returns uuid/i);
assert.match(responseMigration, /submit_guest_extra_order_idempotent_v2[\s\S]*returns uuid/i);
assert.match(responseMigration, /from public, anon, authenticated/);
assert.match(recoveryMigration, /recovery_digest bytea/);
assert.match(recoveryMigration, /recovery_expires_at timestamptz/);
assert.match(recoveryMigration, /resolve_guest_checkout_attempt_v3/);
assert.match(recoveryMigration, /revoke all on function public\.resolve_guest_checkout_attempt\([\s\S]*?from public, anon, authenticated/);
assert.match(recoveryMigration, /grant execute on function public\.submit_guest_preorder_idempotent_v3[\s\S]*?to service_role/);
assert.match(recoveryMigration, /grant execute on function public\.submit_guest_extra_order_idempotent_v3[\s\S]*?to service_role/);
assert.match(recoveryServer, /createHash\("sha256"\)/);
assert.match(recoveryRoute, /randomBytes\(32\)/);
assert.match(recoveryRoute, /origin/);
assert.match(recoveryRoute, /httpOnly: true/);
assert.match(recoveryRoute, /sameSite: "lax"/);
assert.match(recoveryRoute, /const cookiePath = "\/"/);
assert.match(recoveryRoute, /store\.get\(cookieName\)/);
assert.match(recoveryClient, /credentials: "same-origin"/);
assert.match(recoveryClient, /cache: "no-store"/);

console.log("PASS guest checkout idempotency and receipt capability source contracts");
