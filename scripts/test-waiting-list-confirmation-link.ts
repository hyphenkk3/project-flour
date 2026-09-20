/**
 * Phase A — Waiting List confirmation-link foundation (static).
 * Run: npx tsx scripts/test-waiting-list-confirmation-link.ts
 *
 * Engine + source assertions. Does not create waiting-list rows or orders.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateWaitingListConfirmationToken,
  hashWaitingListConfirmationToken,
  isWaitingListConfirmationTokenHash,
  WAITING_LIST_CONFIRMATION_TOKEN_BYTES,
} from "@/engines/waiting-list/confirmation-link";
import { waitingListResponseDeadline } from "@/engines/waiting-list/response-window";
import { DEFAULT_WAITING_LIST_RESPONSE_MINUTES } from "@/engines/waiting-list/types";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function sha256File(rel: string): string {
  return createHash("sha256").update(readSrc(rel), "utf8").digest("hex");
}

const migrationPath =
  "supabase/migrations/20260920180000_waiting_list_confirmation_links.sql";
const enginePath = "src/engines/waiting-list/confirmation-link.ts";
const serverPath = "src/workspaces/waiting-list/confirmation-link.ts";
const sql = readSrc(migrationPath);
const engineSrc = readSrc(enginePath);
const serverSrc = readSrc(serverPath);
const typesSrc = readSrc("src/engines/waiting-list/types.ts");

const historicalMigrations = [
  "supabase/migrations/20260920120000_staff_notification_waiting_list_new_request.sql",
  "supabase/migrations/20260920140000_guest_waiting_list_closed_date.sql",
  "supabase/migrations/20260920160000_guest_waiting_list_multi_item.sql",
] as const;

const historicalHashes = Object.fromEntries(
  historicalMigrations.map((rel) => [rel, sha256File(rel)]),
) as Record<(typeof historicalMigrations)[number], string>;

const issueStart = sql.indexOf(
  "create or replace function public.issue_waiting_list_confirmation_link",
);
assert.ok(issueStart >= 0);
const issueEnd = sql.indexOf(
  "\ncreate or replace function public.",
  issueStart + 1,
);
const issueSql = sql.slice(
  issueStart,
  issueEnd > issueStart ? issueEnd : undefined,
);

const invalidateStart = sql.indexOf(
  "create or replace function public.invalidate_waiting_list_confirmation_links",
);
assert.ok(invalidateStart >= 0);
const invalidateSql = sql.slice(invalidateStart);

// 1. Raw token is not stored.
assert.match(sql, /token_hash text not null/);
assert.doesNotMatch(sql, /\braw_token\b/);
assert.doesNotMatch(sql, /\bencrypted_token\b/);
assert.match(
  sql,
  /SHA-256 hex digest of the raw confirmation token\. The raw token is not stored/,
);
assert.match(engineSrc, /Never persist this value/);
assert.match(engineSrc, /createHash\("sha256"\)/);
assert.match(engineSrc, /randomBytes/);
assert.match(serverSrc, /hashWaitingListConfirmationToken\(token\)/);
assert.match(serverSrc, /p_token_hash: tokenHash/);
assert.doesNotMatch(issueSql, /p_raw_token/);
assert.doesNotMatch(sql, /pgp_sym_encrypt/);

const token = generateWaitingListConfirmationToken();
const tokenHash = hashWaitingListConfirmationToken(token);
assert.equal(token.includes("="), false);
assert.notEqual(token, tokenHash);
assert.equal(isWaitingListConfirmationTokenHash(tokenHash), true);
assert.equal(isWaitingListConfirmationTokenHash(token), false);
assert.equal(tokenHash.length, 64);
assert.match(tokenHash, /^[0-9a-f]{64}$/);
assert.equal(
  tokenHash,
  createHash("sha256").update(token, "utf8").digest("hex"),
);
assert.equal(WAITING_LIST_CONFIRMATION_TOKEN_BYTES, 32);
assert.ok(Buffer.from(token, "base64url").length >= 32);

// 2. Token hash is unique.
assert.match(
  sql,
  /create unique index if not exists waiting_list_confirmation_links_token_hash_uidx/,
);
assert.match(sql, /on public\.waiting_list_confirmation_links \(token_hash\)/);
assert.notEqual(
  hashWaitingListConfirmationToken("alpha-token"),
  hashWaitingListConfirmationToken("beta-token"),
);
assert.equal(
  hashWaitingListConfirmationToken("same-token"),
  hashWaitingListConfirmationToken("same-token"),
);

// 3. Link expires at the existing response_deadline_at.
assert.match(issueSql, /v_expires_at := v_item\.response_deadline_at/);
assert.match(
  sql,
  /Copied from the authoritative waiting_list_items\.response_deadline_at/,
);
assert.match(issueSql, /if v_item\.response_deadline_at is null/);
assert.match(issueSql, /Waiting-list response deadline is required/);
assert.doesNotMatch(issueSql, /make_interval/);
assert.doesNotMatch(issueSql, /_waiting_list_response_minutes/);
assert.equal(DEFAULT_WAITING_LIST_RESPONSE_MINUTES, 30);
const contactedAt = new Date("2026-09-20T04:00:00.000Z");
assert.equal(
  waitingListResponseDeadline(contactedAt, 30).toISOString(),
  "2026-09-20T04:30:00.000Z",
);

// 4. No fulfilment-time-minus-30-minutes logic.
assert.doesNotMatch(issueSql, /pickup_time/);
assert.doesNotMatch(issueSql, /latest_bookable/);
assert.doesNotMatch(issueSql, /closes\s*-/);
assert.doesNotMatch(issueSql, /interval '30 minutes'/);
assert.doesNotMatch(issueSql, /make_interval\(mins => 30\)/);
assert.doesNotMatch(engineSrc, /30 minutes before/);
assert.doesNotMatch(serverSrc, /30 minutes before/);
assert.match(sql, /Link expiry is NOT\n-- fulfilment-time minus 30 minutes/);
assert.match(sql, /is_valid_public_pickup_slot/);
assert.match(sql, /is_valid_delivery_slot/);
assert.match(sql, /is_valid_dine_in_slot/);

// 5. Snapshot contains exact item IDs and offered quantities.
assert.match(sql, /item_snapshot jsonb not null/);
assert.match(issueSql, /'waiting_list_item_id', v_item\.id/);
assert.match(issueSql, /'cake_id', v_item\.library_cake_id/);
assert.match(issueSql, /'cake_size_id', v_item\.library_cake_size_id/);
assert.match(issueSql, /'offered_quantity', v_hold\.quantity/);
assert.doesNotMatch(issueSql, /p_cake_id/);
assert.doesNotMatch(issueSql, /p_offered_quantity/);
assert.doesNotMatch(issueSql, /p_item_id/);
assert.match(issueSql, /i\.status = 'contacted'/);
assert.match(issueSql, /h\.status = 'active'/);
assert.match(issueSql, /v_hold\.quantity > v_item\.remaining_quantity/);
assert.match(serverSrc, /waitingListItemId/);
assert.match(serverSrc, /offeredQuantity/);

// 6. Customer cannot enumerate links through RLS.
assert.match(sql, /enable row level security/);
assert.match(
  sql,
  /revoke all on table public\.waiting_list_confirmation_links\n {2}from public, anon, authenticated/,
);
assert.doesNotMatch(sql, /create policy/);
assert.doesNotMatch(sql, /for select to anon/);
assert.doesNotMatch(sql, /for select to authenticated/);
assert.doesNotMatch(
  sql,
  /grant select on table public\.waiting_list_confirmation_links/,
);
assert.match(
  sql,
  /revoke all on function public\.issue_waiting_list_confirmation_link\(uuid, uuid, text\)\n {2}from public, anon/,
);
assert.match(
  sql,
  /grant execute on function public\.issue_waiting_list_confirmation_link\(uuid, uuid, text\)\n {2}to authenticated/,
);

// 7. Multiple historical links can exist after prior links expire/invalidate.
assert.doesNotMatch(
  sql,
  /create unique index if not exists waiting_list_confirmation_links_request_uidx/,
);
assert.match(sql, /set status = 'expired'/);
assert.match(invalidateSql, /set status = 'invalidated'/);
assert.match(sql, /and status = 'issued'\n {4}and expires_at <= now\(\)/);
assert.match(
  sql,
  /create index if not exists waiting_list_confirmation_links_request_idx/,
);

// 8. Only one issued link exists per request at a time.
assert.match(
  sql,
  /create unique index if not exists waiting_list_confirmation_links_one_issued_per_request_idx/,
);
assert.match(
  sql,
  /on public\.waiting_list_confirmation_links \(request_id\)\n {2}where status = 'issued'/,
);
assert.match(
  issueSql,
  /A confirmation link is already issued for this request/,
);

// 9. No order is created by issuing a link.
assert.doesNotMatch(issueSql, /create_staff_guest_preorder/);
assert.doesNotMatch(issueSql, /waiting_list_convert_item/);
assert.doesNotMatch(issueSql, /insert into public\.orders/);
assert.doesNotMatch(issueSql, /converted_order_id/);
assert.match(serverSrc, /Does not create an order/);
assert.doesNotMatch(sql, /submit_waiting_list_confirmation/);
assert.match(sql, /submitted_payload jsonb/);
assert.match(sql, /Not written in Phase A/);

// 10. Existing Waiting List migrations remain unchanged.
for (const rel of historicalMigrations) {
  assert.equal(existsSync(resolve(process.cwd(), rel)), true);
  assert.doesNotMatch(readSrc(rel), /waiting_list_confirmation_links/);
  assert.equal(sha256File(rel), historicalHashes[rel]);
}
assert.doesNotMatch(
  readSrc(
    "supabase/migrations/20260920120000_staff_notification_waiting_list_new_request.sql",
  ),
  /confirmation_link/,
);
assert.match(
  readSrc(
    "supabase/migrations/20260920140000_guest_waiting_list_closed_date.sql",
  ),
  /is_pickup_orders_closed\(p_pickup_date\)/,
);
assert.match(
  readSrc(
    "supabase/migrations/20260920160000_guest_waiting_list_multi_item.sql",
  ),
  /group by cake_id, size_id/,
);

assert.match(typesSrc, /confirmation_link_issued/);
assert.match(typesSrc, /confirmation_link_invalidated/);
assert.match(issueSql, /_waiting_list_assert_manage_staff/);
assert.match(
  issueSql,
  /v_request\.status in \('cancelled', 'closed', 'converted'\)/,
);
assert.match(sql, /constraint waiting_list_confirmation_links_status_check/);
assert.match(sql, /'issued', 'submitted', 'expired', 'invalidated'/);
assert.match(sql, /issued_by_staff_id uuid not null/);
assert.match(sql, /expires_at timestamptz not null/);
assert.doesNotMatch(
  readSrc("src/workspaces/waiting-list/WaitingListBoard.tsx"),
  /hashWaitingListConfirmationToken/,
);
assert.doesNotMatch(
  readSrc("src/workspaces/waiting-list/WaitingListBoard.tsx"),
  /generateWaitingListConfirmationToken/,
);
assert.doesNotMatch(
  readSrc("src/workspaces/waiting-list/WaitingListBoard.tsx"),
  /token_hash/,
);

console.log("waiting-list confirmation-link foundation tests passed");
console.log(
  "historical migration hashes",
  JSON.stringify(historicalHashes, null, 2),
);
