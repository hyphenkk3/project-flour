import { NextResponse } from "next/server";

import { authorizeStaffPushNotificationDispatch } from "@/foundation/staff/staff-notification-push-dispatch-auth";
import { deliverPendingStaffPushNotifications } from "@/foundation/staff/staff-notification-push-dispatch";

export const dynamic = "force-dynamic";

async function handlePushDispatch(request: Request): Promise<NextResponse> {
  const auth = authorizeStaffPushNotificationDispatch(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let eventId: string | undefined;
  if (request.method === "POST") {
    try {
      const body = (await request.json()) as { eventId?: unknown };
      if (typeof body?.eventId === "string" && body.eventId.trim()) {
        eventId = body.eventId.trim();
      }
    } catch {
      eventId = undefined;
    }
  }

  const result = await deliverPendingStaffPushNotifications({ eventId });
  return NextResponse.json({ ok: true, result });
}

export async function POST(request: Request) {
  return handlePushDispatch(request);
}
