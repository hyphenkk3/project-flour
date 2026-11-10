export const DEV_SERVICE_ROLE_CHECK_BRANCH =
  "codex/staff-notifications-dev-20261109";
export const DEV_SERVICE_ROLE_CHECK_URL =
  "https://tzwtpxdcggesgjaqxkqr.supabase.co";
// This temporary route closes automatically after its short acceptance window.
export const DEV_SERVICE_ROLE_CHECK_EXPIRES_AT = Date.parse(
  "2026-11-10T15:30:00+08:00",
);

export type DiagnosticEnvironment = {
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
};

export function diagnosticEnvironmentAllowed(
  env: DiagnosticEnvironment,
  now = Date.now(),
): boolean {
  return (
    now < DEV_SERVICE_ROLE_CHECK_EXPIRES_AT &&
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_GIT_COMMIT_REF === DEV_SERVICE_ROLE_CHECK_BRANCH &&
    env.NEXT_PUBLIC_SUPABASE_URL === DEV_SERVICE_ROLE_CHECK_URL
  );
}

export function diagnosticOwnerAllowed(
  staff: {
    isActive: boolean;
    isMasterOwner: boolean;
    role: { code: string };
  } | null,
): boolean {
  return Boolean(
    staff?.isActive && staff.isMasterOwner && staff.role.code === "owner",
  );
}

export function diagnosticSameOriginAllowed(
  requestOrigin: string | null,
  actualOrigin: string,
): boolean {
  return requestOrigin !== null && requestOrigin === actualOrigin;
}

export type DiagnosticOutcome = "PASS" | "FAIL" | "HOLD";

/** One fixed-host, one-shot HEAD request; no retries and no response body read. */
export async function verifyDevServiceRoleCredential(
  serviceRoleKey: string | undefined,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<DiagnosticOutcome> {
  if (!serviceRoleKey?.trim()) return "FAIL";

  const headers = new Headers({ apikey: serviceRoleKey });
  // Legacy JWT service-role keys require the role JWT. Supabase secret API
  // keys are identified by apikey and must not be sent as a Bearer JWT.
  if (!serviceRoleKey.startsWith("sb_secret_")) {
    headers.set("authorization", `Bearer ${serviceRoleKey}`);
  }

  try {
    const response = await fetchImpl(
      `${DEV_SERVICE_ROLE_CHECK_URL}/rest/v1/staff_notification_push_subscriptions?select=id&limit=0`,
      {
        method: "HEAD",
        headers,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      },
    );

    if (response.ok) return "PASS";
    if (response.status === 401 || response.status === 403) return "FAIL";
    return "HOLD";
  } catch {
    return "HOLD";
  }
}
