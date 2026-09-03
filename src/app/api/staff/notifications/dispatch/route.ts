import { NextResponse } from "next/server";

import { authorizeStaffNotificationDispatch } from "@/foundation/staff/staff-notification-dispatch-auth";
import { deliverPendingStaffNotificationEmails } from "@/foundation/staff/staff-notification-dispatch";

export const dynamic = "force-dynamic";

async function handleDispatch(request: Request): Promise<NextResponse> {
  const auth = authorizeStaffNotificationDispatch(request);
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

  const results = await deliverPendingStaffNotificationEmails({ eventId });
  return NextResponse.json({ ok: true, results });
}

export async function GET(request: Request) {
  return handleDispatch(request);
}

export async function POST(request: Request) {
  return handleDispatch(request);
}
