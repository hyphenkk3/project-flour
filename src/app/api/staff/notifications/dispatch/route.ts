import { NextResponse } from "next/server";

import { authorizeStaffNotificationDispatch } from "@/foundation/staff/staff-notification-dispatch-auth";
import { deliverPendingStaffNotificationEmails } from "@/foundation/staff/staff-notification-dispatch";
import { deliverPendingStaffPushNotifications } from "@/foundation/staff/staff-notification-push-dispatch";
import { LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED } from "@/foundation/staff/legacy-staff-notification-email-pause";
import { parseStaffPushEventScope } from "@/foundation/staff/staff-notification-push-protocol";

export const dynamic = "force-dynamic";

async function handleDispatch(request: Request): Promise<NextResponse> {
  const auth = authorizeStaffNotificationDispatch(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let eventId: string | undefined;
  let pushResults: Awaited<
    ReturnType<typeof deliverPendingStaffPushNotifications>
  > | null = null;
  if (request.method === "POST") {
    let body: { eventId?: unknown } | null = null;
    try {
      body = (await request.json()) as { eventId?: unknown };
    } catch {
      // Keep the legacy email route's malformed-body behavior. It cannot
      // trigger Push because no validated event scope was obtained.
    }
    const scope = parseStaffPushEventScope(body?.eventId);
    if (scope.kind === "invalid") {
      return NextResponse.json(
        { error: "A valid event ID is required." },
        { status: 400 },
      );
    }
    if (scope.kind === "event") {
      eventId = scope.eventId;
      pushResults = await deliverPendingStaffPushNotifications({ eventId });
    }
  }

  if (LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED) {
    const response: {
      error: string;
      push?: Awaited<ReturnType<typeof deliverPendingStaffPushNotifications>>;
    } = { error: "Staff email dispatch is paused." };
    if (pushResults) response.push = pushResults;
    return NextResponse.json(response, { status: 503 });
  }

  const results = await deliverPendingStaffNotificationEmails({ eventId });
  return NextResponse.json({ ok: true, results });
}

export async function GET(request: Request) {
  return handleDispatch(request);
}

export async function POST(request: Request) {
  return handleDispatch(request);
}
