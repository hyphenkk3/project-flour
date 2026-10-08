import { authorizeStaffNotificationDispatch } from "@/foundation/staff/staff-notification-dispatch-auth";
import { deliverPendingStaffNotificationEmails } from "@/foundation/staff/staff-notification-dispatch";
import { createStaffNotificationDispatchRouteHandlers } from "@/foundation/staff/staff-notification-dispatch-route";

export const dynamic = "force-dynamic";

const handlers = createStaffNotificationDispatchRouteHandlers({
  authorize: authorizeStaffNotificationDispatch,
  deliver: (scope) => deliverPendingStaffNotificationEmails(scope),
});

export async function GET(request: Request) {
  return handlers.GET(request);
}

export async function POST(request: Request) {
  return handlers.POST(request);
}
