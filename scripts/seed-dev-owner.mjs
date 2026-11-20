/**
 * Development seed: Owner role + sample active Owner staff.
 *
 * Prerequisites:
 * - Apply supabase/migrations to your Supabase project
 * - Set env vars in .env.local
 *
 * Login uses username (not email). The DEV seed password must be supplied
 * at runtime in PROJECT_FLOUR_DEV_OWNER_PASSWORD from a trusted secret
 * source. Do not store it in .env.local or place it in shell command text.
 * It is never printed, and the seed fails closed when it is absent.
 *
 * Supabase Auth still requires an email on the auth user. That email is an
 * implementation detail for Auth storage only and is never used as the app
 * login identifier.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key === "PROJECT_FLOUR_DEV_OWNER_PASSWORD") {
      continue;
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const DEV_SUPABASE_URL = "https://tzwtpxdcggesgjaqxkqr.supabase.co";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.PROJECT_FLOUR_DEV_OWNER_PASSWORD;

if (url !== DEV_SUPABASE_URL) {
  console.error("Refusing to run: this seed script is restricted to the authorized DEV Supabase project.");
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!password) {
  console.error("Missing PROJECT_FLOUR_DEV_OWNER_PASSWORD; no credentials were changed.");
  process.exit(1);
}

if (password.length < 12) {
  console.error("PROJECT_FLOUR_DEV_OWNER_PASSWORD must contain at least 12 characters.");
  process.exit(1);
}

const username = "owner";
const authEmail = "owner@whitebird.dev";
const displayName = "Owner (Dev)";

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: ownerRole, error: roleError } = await admin
    .from("roles")
    .select("id, code")
    .eq("code", "owner")
    .single();

  if (roleError || !ownerRole) {
    throw (
      roleError ?? new Error("Owner role not found. Apply migrations first.")
    );
  }

  const { data: existingProfile } = await admin
    .from("staff_profiles")
    .select("id, auth_user_id")
    .eq("username", username)
    .maybeSingle();

  if (existingProfile) {
    console.log("Dev Owner already exists.");
    console.log(`  username: ${username}`);
    return;
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        display_name: displayName,
      },
    });

  if (createError || !created.user) {
    throw createError ?? new Error("Failed to create auth user.");
  }

  const { error: profileError } = await admin.from("staff_profiles").insert({
    auth_user_id: created.user.id,
    username,
    email: authEmail,
    display_name: displayName,
    role_id: ownerRole.id,
    is_active: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw profileError;
  }

  console.log("Dev Owner created.");
  console.log(`  username: ${username}`);
  console.log(
    "  Note: Auth stores an email internally; app login uses username only.",
  );
}

main().catch(() => {
  console.error("DEV Owner seed failed; no error details or credentials were logged.");
  process.exit(1);
});
