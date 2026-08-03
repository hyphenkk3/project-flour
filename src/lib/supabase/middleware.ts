import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  AUTH_FETCH_TIMEOUT_MS,
  fetchWithTimeout,
} from "@/lib/supabase/fetch-timeout";

export async function updateSession(
  request: NextRequest,
  timeoutMs: number = AUTH_FETCH_TIMEOUT_MS,
) {
  let supabaseResponse = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
    global: {
      // Hard abort — Promise.race alone leaves getUser() running and can
      // exhaust the process until even public routes stop responding.
      fetch: fetchWithTimeout(timeoutMs),
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user, supabaseResponse };
}
