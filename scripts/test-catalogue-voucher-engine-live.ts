/**
 * Live DEV probe for the catalogue voucher engine.
 * Run: npx --cache /tmp/npm-cache-voucher --yes tsx scripts/test-catalogue-voucher-engine-live.ts
 * DEV only. Cleans up the disposable voucher/order it creates.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

function singaporeYmd(value = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log("SKIP live DB (missing Supabase env).");
    process.exit(0);
  }
  if (!url.includes("tzwtpxdcggesgjaqxkqr")) {
    throw new Error("Refusing to run outside project-flour-dev.");
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: tableError } = await admin
    .from("library_voucher_rules")
    .select("id")
    .limit(1);
  if (tableError) {
    throw new Error(`library_voucher_rules missing: ${tableError.message}`);
  }

  const { data: publicList, error: publicError } = await admin.rpc(
    "list_public_catalogue_vouchers",
  );
  if (publicError) {
    throw new Error(publicError.message);
  }
  assert.ok(Array.isArray(publicList));

  const today = singaporeYmd();
  const code = `CATENG-${Date.now().toString().slice(-8)}`;
  const { data: voucher, error: voucherError } = await admin
    .from("library_vouchers")
    .insert({
      code,
      voucher_type: "fixed_amount",
      value: 10,
      valid_from: today,
      valid_until: today,
      status: "active",
    })
    .select("id")
    .single();
  if (voucherError || !voucher) {
    throw new Error(voucherError?.message ?? "Could not create probe voucher.");
  }

  const { data: rule, error: ruleError } = await admin
    .from("library_voucher_rules")
    .insert({
      voucher_id: voucher.id,
      rule_type: "minimum_cake_subtotal",
      amount: 100,
    })
    .select("id")
    .single();
  if (ruleError) {
    await admin.from("library_vouchers").delete().eq("id", voucher.id);
    throw new Error(ruleError.message);
  }

  const listed = await admin.rpc("list_public_catalogue_vouchers");
  const found = (listed.data as Array<{ code?: string }> | null)?.some(
    (row) => row.code === code,
  );
  assert.equal(found, true, "active catalogue voucher should be discoverable");

  await admin.from("library_voucher_rules").delete().eq("id", rule.id);
  await admin.from("library_vouchers").delete().eq("id", voucher.id);
  console.log("catalogue voucher live DEV probe passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
