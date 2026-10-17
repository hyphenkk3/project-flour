/** Focused contract test for the Fresh Pick manual-slicing RPC security fix. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261017142007_bind_cut_extra_stock_actor_and_restrict_execute.sql",
  ),
  "utf8",
);

assert.match(migration, /public\._bind_rpc_actor\(p_actor_staff_id\)/);
assert.match(migration, /v_role not in \('bakery', 'manager', 'owner'\)/);
assert.match(migration, /for update/i);
assert.match(migration, /cut_into_slices_by = v_actor_staff_id/);
assert.match(migration, /'cut_into_slices',[\s\S]*v_actor_staff_id/);
assert.match(migration, /stock_row\.lifecycle <> 'confirmed'/);
assert.match(migration, /stock_row\.sold_at is not null/);
assert.match(migration, /stock_row\.cut_into_slices_at is not null/);
assert.match(
  migration,
  /revoke all privileges on function public\.cut_extra_stock_into_slices\(uuid, uuid\)\s+from public/i,
);
assert.match(
  migration,
  /revoke all privileges on function public\.cut_extra_stock_into_slices\(uuid, uuid\)\s+from anon/i,
);
assert.match(
  migration,
  /grant execute on function public\.cut_extra_stock_into_slices\(uuid, uuid\)\s+to authenticated, service_role/i,
);
assert.doesNotMatch(migration, /insert into public\.[a-z_]*slice/i);

console.log("PASS Fresh Pick cut RPC actor binding contract");
