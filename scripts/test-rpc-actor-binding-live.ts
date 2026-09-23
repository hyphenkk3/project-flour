/**
 * Live privileged RPC actor binding + delivery roles + payment write lock.
 * Run: npx tsx scripts/test-rpc-actor-binding-live.ts
 *
 * Isolated fixtures only. Requires the 20260923200000 migration on DEV.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

function rpcMessage(error: { message?: string } | null | undefined): string {
  return error?.message ?? "";
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceRoleKey) {
    console.log("SKIP live DB (missing Supabase env).");
    return;
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = anonKey
    ? createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  const helperProbe = await admin.rpc("_bind_rpc_actor", {
    p_claimed_staff_id: "00000000-0000-4000-8000-000000000002",
  });
  const helperMsg = rpcMessage(helperProbe.error);
  if (/could not find the function|schema cache|does not exist/i.test(helperMsg)) {
    console.log(
      "SKIP live DB (apply supabase/migrations/20260923200000_rpc_actor_binding_and_payment_write_lock.sql).",
    );
    return;
  }

  const { data: roles, error: roleErr } = await admin
    .from("roles")
    .select("id, code");
  if (roleErr) throw roleErr;
  const roleId = (code: string) =>
    roles?.find((row) => row.code === code)?.id ?? null;

  async function staffFor(code: string) {
    const id = roleId(code);
    if (!id) return null;
    const { data } = await admin
      .from("staff_profiles")
      .select("id")
      .eq("role_id", id)
      .eq("is_active", true)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    return data?.id ?? null;
  }

  const ownerId = await staffFor("owner");
  const bakeryId = await staffFor("bakery");
  assert.ok(ownerId, "need an active Owner staff row");

  const missingActor = await admin.rpc("mark_guest_order_out_for_delivery", {
    p_order_id: "00000000-0000-4000-8000-000000000001",
    p_actor_staff_id: null,
  });
  assert.match(
    rpcMessage(missingActor.error),
    /Staff actor is required|Not authenticated|Not authorized/i,
  );

  const unknownActor = await admin.rpc("mark_guest_order_out_for_delivery", {
    p_order_id: "00000000-0000-4000-8000-000000000001",
    p_actor_staff_id: "00000000-0000-4000-8000-000000000099",
  });
  assert.match(rpcMessage(unknownActor.error), /Staff actor not found|Not authorized/i);

  if (bakeryId) {
    const bakeryDenied = await admin.rpc("mark_guest_order_out_for_delivery", {
      p_order_id: "00000000-0000-4000-8000-000000000001",
      p_actor_staff_id: bakeryId,
    });
    assert.match(
      rpcMessage(bakeryDenied.error),
      /Not authorized to mark out for delivery/i,
    );
  }

  const ownerMissingOrder = await admin.rpc(
    "mark_guest_order_out_for_delivery",
    {
      p_order_id: "00000000-0000-4000-8000-000000000001",
      p_actor_staff_id: ownerId,
    },
  );
  assert.match(rpcMessage(ownerMissingOrder.error), /Order not found/i);

  if (anon) {
    const unauth = await anon.rpc("mark_guest_order_out_for_delivery", {
      p_order_id: "00000000-0000-4000-8000-000000000001",
      p_actor_staff_id: ownerId,
    });
    assert.match(
      rpcMessage(unauth.error),
      /Not authenticated|Not authorized|permission denied|JWT/i,
    );

    const paymentInsert = await anon.from("payments").insert({
      amount: 1,
      method: "wb_qr",
      paid_at: new Date().toISOString(),
      status: "verified",
    });
    assert.ok(paymentInsert.error, "anon must not insert payments");

    const allocationInsert = await anon.from("payment_allocations").insert({
      payment_id: "00000000-0000-4000-8000-000000000001",
      order_id: "00000000-0000-4000-8000-000000000001",
      amount: 1,
    });
    assert.ok(allocationInsert.error, "anon must not insert allocations");
  }

  console.log("PASS rpc actor binding (live probes)");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
