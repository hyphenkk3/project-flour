import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  DATA_FETCH_TIMEOUT_MS,
  fetchWithTimeout,
} from "@/lib/supabase/fetch-timeout";

type CreateClientOptions = {
  /** Abort in-flight Supabase fetches after this many ms. */
  timeoutMs?: number;
};

export async function createClient(options?: CreateClientOptions) {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();
  const timeoutMs = options?.timeoutMs ?? DATA_FETCH_TIMEOUT_MS;

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
            cookieStore.set(name, value, cookieOptions);
          });
        } catch {
          // Called from a Server Component where cookies are read-only.
        }
      },
    },
    global: {
      fetch: fetchWithTimeout(timeoutMs),
    },
  });
}
