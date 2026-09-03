/**
 * Trusted invocation for server-side staff notification email dispatch.
 * Never accepts a staff session as proof that an email should send.
 */
export function staffNotificationDispatchSecret(): string | null {
  const secret =
    process.env.STAFF_NOTIFICATION_DISPATCH_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    null;
  return secret || null;
}

export function authorizeStaffNotificationDispatch(
  request: Request,
): { ok: true } | { ok: false; status: number; error: string } {
  const secret = staffNotificationDispatchSecret();

  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "Staff notification dispatch is not configured.",
    };
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (authorization === `Bearer ${secret}`) {
    return { ok: true };
  }

  return {
    ok: false,
    status: 401,
    error: "Unauthorized.",
  };
}
