import { NextResponse } from "next/server";

import { authorizeStaffPushNotificationDispatch } from "@/foundation/staff/staff-notification-push-dispatch-auth";
import { retryPendingStaffPushNotifications } from "@/foundation/staff/staff-notification-push-dispatch";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = authorizeStaffPushNotificationDispatch(request);
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status },
    );
  }

  const result = await retryPendingStaffPushNotifications();
  return NextResponse.json({ ok: true, result });
}
