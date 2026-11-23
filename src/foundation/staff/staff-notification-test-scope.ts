export const STAFF_NOTIFICATION_TEST_TITLE = "SYSTEM TEST — NO REAL ORDER";
export const STAFF_NOTIFICATION_TEST_KIND = "owner_notification_acceptance";

export type StaffNotificationTestScope =
  | { kind: "normal" }
  | { kind: "owner_only"; recipientStaffId: string }
  | { kind: "invalid" };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveStaffNotificationTestScope(
  title: string,
  payload: Record<string, unknown> | null | undefined,
): StaffNotificationTestScope {
  const metadata = payload?.notificationTest;
  const carriesTestMetadata =
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata);
  const markerTitle = title.trim() === STAFF_NOTIFICATION_TEST_TITLE;

  if (!carriesTestMetadata && !markerTitle) return { kind: "normal" };
  if (!carriesTestMetadata || !markerTitle) return { kind: "invalid" };

  const test = metadata as Record<string, unknown>;
  const recipientStaffId = test.recipientStaffId;
  if (
    test.kind !== STAFF_NOTIFICATION_TEST_KIND ||
    typeof recipientStaffId !== "string" ||
    !UUID_PATTERN.test(recipientStaffId)
  ) {
    return { kind: "invalid" };
  }

  return { kind: "owner_only", recipientStaffId };
}

export function isStaffNotificationVisibleToRecipient(input: {
  title: string;
  payload: Record<string, unknown> | null | undefined;
  staffId: string;
}): boolean {
  const scope = resolveStaffNotificationTestScope(input.title, input.payload);
  return (
    scope.kind === "normal" ||
    (scope.kind === "owner_only" && scope.recipientStaffId === input.staffId)
  );
}
