import { NextResponse } from "next/server";
import { getSessionStaff } from "@/foundation/auth/session";
import {
  executeOneShotStaffNotificationEmailTest,
  isDevOneShotEmailTestEnvironment,
} from "@/foundation/staff/staff-notification-one-shot-test";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (!isDevOneShotEmailTestEnvironment()) {
    return errorResponse("Not found.", 404);
  }

  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("Forbidden.", 403);
  }

  const staff = await getSessionStaff();
  if (!staff?.isActive || !staff.isMasterOwner || staff.role.code !== "owner") {
    return errorResponse("Owner authorization required.", 403);
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return errorResponse("Malformed JSON.", 400);
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return errorResponse("A scope, event, and staff ID are required.", 400);
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).length !== 3 ||
    Object.keys(body).some(
      (key) => !["scopeId", "eventId", "staffId"].includes(key),
    )
  ) {
    return errorResponse(
      "Only scopeId, eventId, and staffId are accepted.",
      400,
    );
  }
  if (
    typeof body.scopeId !== "string" ||
    !UUID_PATTERN.test(body.scopeId) ||
    typeof body.eventId !== "string" ||
    !UUID_PATTERN.test(body.eventId) ||
    typeof body.staffId !== "string" ||
    !UUID_PATTERN.test(body.staffId)
  ) {
    return errorResponse(
      "Valid scopeId, eventId, and staffId are required.",
      400,
    );
  }

  const result = await executeOneShotStaffNotificationEmailTest({
    scopeId: body.scopeId,
    eventId: body.eventId,
    staffId: body.staffId,
  });
  if (result.outcome === "accepted") {
    return NextResponse.json({ ok: true, outcome: result.outcome });
  }
  return NextResponse.json(
    { ok: false, outcome: result.outcome },
    { status: 409 },
  );
}
