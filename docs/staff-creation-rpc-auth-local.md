# Staff creation RPC authorization — local draft, 11 October 2026

Status: Local correction complete. GO for a separately approved controlled DEV migration, subject to preflight checks; no hosted application is authorized.
Starting/unchanged HEAD: 702fc5e2b0246dd2cd996946e2995893fa4ce2eb.
No commits, pushes, deployments, hosted SQL, hosted exploit attempts, fixtures or emails.
Original dirty repository and Staff Email V1 worktree untouched.

## Files changed

- supabase/migrations/20261011100225_staff_creation_rpc_actor_authorization.sql
- scripts/test-staff-creation-rpc-auth-db.py
- docs/staff-creation-rpc-auth-local.md

Migration SHA-256: `f2082ba08850d068f85bccc7c835341d3611addc6b41cf38197aaa06cfa5f33a`.
This is one new additive migration; no applied migration is edited.

## Implemented correction

Both public signatures, defaults and return types are unchanged. A guard at entry requires
non-null auth.uid(), a matching staff_profiles.auth_user_id, the same supplied staff ID,
is_active=true, and the actual staff role from roles. User metadata is not trusted.
Staff preorder allows owner/manager/customer_operations; stock creation allows
owner/manager/bakery. No service-role override exists; service_role and anon execution
are explicitly revoked together with PUBLIC. Authenticated execution and owner access remain.
SECURITY DEFINER and postgres ownership are retained for atomic privileged business writes;
search_path is empty and application objects remain schema-qualified.
Normalized-body fingerprints and owner/security checks fail closed if the two installed
functions differ from the reviewed DEV definitions. The migration is transaction-wrapped.
Business bodies following the guards are preserved, including date-price resolution,
cake snapshots, availability-trigger enforcement and physical-stock behavior.
No global default privileges, email functions, RLS or unrelated ACLs are changed.

## Approved waiting-list compatibility

The user approved preserving bakery conversion through a private path while denying direct
bakery preorder creation. Implemented in this SAME additive migration:

- New schema staff_preorder_private is owned by postgres, inaccessible to PUBLIC/anon/
  authenticated/service_role. Its single creation function explicitly revokes all those roles.
- The original preorder business body moves to that private function, with identity binding,
  active-staff and owner/manager/customer_operations/bakery role validation.
- The public preorder signature becomes a thin authenticated wrapper with the stricter direct
  owner/manager/customer_operations role gate. It forwards all original arguments/defaults.
- Both existing conversion wrappers authenticate the real caller BEFORE any read, write or
  already-converted return, preserve all signatures, and call the private implementation.
- Both wrappers retain bakery/owner/manager/Customer Operations access; anon/service-only
  execution is revoked. The postgres-owned wrappers retain access to the private function.
- No caller-controlled flag, session marker, service bypass or new public privileged RPC exists.
- Stock creation remains a separately guarded public function with owner/manager/bakery access.
- All four public functions and the private implementation use empty search_path. Their
  identity checks read auth.uid(), which remains the request identity through nested definers.

Read-only DEV recheck on 11 October 2026 verified project-flour-dev / tzwtpxdcggesgjaqxkqr.
All four current DEV signatures, postgres ownership, SECURITY DEFINER status and normalized
body hashes match the migration's exact preconditions:

| Function | Reviewed normalized body MD5 |
|---|---|
| create_staff_guest_preorder | e153d2fc4acc932d688ee250a6f29707 |
| create_confirmed_extra_stock | 29bc7e5e625faf7e16ebd586c074b538 |
| waiting_list_convert_item | 374273401a376b3afd5a01374e7bf033 |
| waiting_list_convert_confirmation | c32f110068e9368e3230f2f078cb9f9b |

All baseline checks occur before modifications. Local comparison verifies the original
preorder/stock/wrapper business bodies are identical after removing only the new identity
guards and private call redirection. Existing source restrictions, quantities, snapshots,
pricing, holds and audit operations are not rewritten. No applied migration is modified.

## Tests executed

- 66 new disposable authorization/conversion cases PASS across both creation RPCs and both
  real conversion wrapper bodies (32 original cases plus 34 private/conversion cases).
  Anonymous, customers/no mapped profile, missing/malformed identity, missing/wrong/forged
  actor, inactive staff, insufficient roles and service-only calls reject without new
  orders/items/stock/timeline writes. Owner/manager pass both functions; bakery passes stock
  only; Customer Operations passes preorder only.
- Additional checks PASS: scheduled price, inclusive availability start, October rejection,
  invalid quantity, historical snapshot unchanged, stock outside preorder dates,
  actor attribution, owner/authenticated EXECUTE, anon/service revocation, empty search_path,
  unchanged unrelated function ACLs.
- Existing amendment disposable SQL suite: 66 assertions PASS.
- Existing availability unit/server-action scenarios: PASS; prior 17 scenario coverage retained.
- Existing regression selection: 38/46 PASS. Same eight inherited failures as documented
  before this correction; no application files changed. Failure list below.
- Actual waiting-list conversion SQL: all four authorized roles PASS through both wrappers,
  including bakery. Scheduled catalogue prices, cake snapshots, hold consumption and attribution
  PASS. Invalid pickup date/excess quantity reject with complete order/hold/event rollback.
  Converted confirmation idempotence remains functional and rejects customer/forged identities.
  All three API roles fail direct entry into the private implementation.
- Migration refusal on changed owner and transaction rollback after a synthetic late failure PASS.
- Nine waiting-list static regression suites PASS.
- Adjacent new-order-content suite PASS. Additional order-lifecycle suite FAIL on an inherited
  guard_post_payment_customer_change source assertion. Reproduced on an exact disposable copy
  of deployed baseline 702fc5e; no security correction was present in that copy. Left unchanged.
- Five application email pause guards PASS with external network blocked: dispatch API,
  scheduler, worker, recipient helper and Resend adapter. Zero mocked provider requests/sends.
  Original inherited harness has synchronous-exception/top-level-await limitations;
  a temporary local compatible harness was used and removed, source unchanged.

Disposable database uses only a hardcoded Unix socket, never loads .env or hosted credentials.
Real creation/pricing/availability and both conversion bodies are exercised; ancillary fulfilment/add-on dependencies
and waiting-list event/status helpers are fixture adapters. Stock attribution fields are checked; full production stock-event triggers,
checkout/payment lifecycle and live JWT gateway verification are not reproduced by this fixture.
Local auth.uid() reads synthetic claims to exercise the database boundary; real hosted tokens
are neither forged nor used. All denied-case snapshots exclude sequence counters, which are
not transactional in PostgreSQL.

Inherited failures from the 46-suite selection (plus the additional lifecycle baseline failure described above):
- scripts/test-extra-phase6-fresh-picks.ts
- scripts/test-fresh-picks-date-progression.ts
- scripts/test-customer-operations-assisted-fulfilment.ts
- scripts/test-operations-approvals.ts
- scripts/test-whole-cake-customer-fulfilment.ts
- scripts/test-dine-in-reservation-serving-window.ts
- scripts/test-cart-pickup-compatibility.ts
- scripts/test-library-cake-size-prices.ts

## Release/recovery

GO for controlled DEV migration preparation/review. Actual hosted application remains unapproved.
Recheck exact current DEV bodies/owners/signatures/dependencies and all migration hashes read-only
before seeking hosted approval. Verify the private schema is absent and the executor can create
postgres-owned objects. Apply only this final single-file migration; its updated SHA-256 supersedes
both earlier draft hashes. No app deployment or broad migration push is required for these
signature-compatible database guards. Existing service-role test fixture scripts will need authenticated
staff sessions or local fixture replacement; no legitimate service-only runtime caller was found.
No additional acceptance fixtures should be created before security correction is deployed safely.

Before any approved hosted migration, capture current definitions and ACLs. Apply only the reviewed
single migration transaction; do not replay unrelated migrations. If post-verification fails,
stop; do not restore vulnerable grants/definitions automatically. Safest containment is separately
approved revocation of affected authenticated entry points and a forward correction. Preserve
created orders/stock/audit records. Production requires separate review and approval.

## Exact local execution commands

- python3 scripts/test-staff-creation-rpc-auth-db.py
- python3 scripts/test-cake-size-amendment-db.py (existing 66 assertions)
- node --import /private/tmp/flour-block-external-network.mjs /Users/ycwee/.npm/_npx/95c8da6ffd4052b6/node_modules/tsx/dist/cli.mjs scripts/test-cake-size-availability.ts
- Existing 46-suite runner and 11 adjacent static suites with the same network-blocking preload.
- Temporary compatible five-guard email harness (removed after testing; production source unchanged).

No business-policy decisions remain. Hosted JWT/PostgREST and complete workflow acceptance remain
for separately authorized DEV validation; actual Production DB equivalence has not been inspected.
