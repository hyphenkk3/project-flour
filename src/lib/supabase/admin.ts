import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleFetch } from "@/lib/supabase/service-role-fetch";
import { getSupabaseEnv } from "@/lib/supabase/env";

function getServiceRoleKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return serviceRoleKey;
}

export function createServiceClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = getServiceRoleKey();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    ...(serviceRoleKey.startsWith("sb_secret_")
      ? { global: { fetch: createServiceRoleFetch(serviceRoleKey) } }
      : {}),
  });
}
