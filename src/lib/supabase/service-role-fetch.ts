import "server-only";

/**
 * Supabase JS 2.111.0's REST transport uses the API key as a Bearer fallback.
 * New-format secret keys are not JWTs, so remove only that exact fallback while
 * preserving caller-supplied Authorization tokens and all other request data.
 */
export function createServiceRoleFetch(
  serviceRoleKey: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    const authorization = headers.get("authorization");
    const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (bearer === serviceRoleKey) {
      headers.delete("authorization");
    }

    if (!headers.has("apikey")) {
      headers.set("apikey", serviceRoleKey);
    }

    return fetchImpl(input, { ...init, headers });
  };
}
