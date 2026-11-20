import "server-only";

export function authorizeStaffPushNotificationDispatch(
  request: Request,
): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.STAFF_PUSH_DISPATCH_SECRET?.trim() ?? "";
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "Staff push dispatch is not configured.",
    };
  }

  if (request.headers.get("authorization")?.trim() !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  return { ok: true };
}
