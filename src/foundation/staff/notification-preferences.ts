import type { RoleCode } from "@/types/staff";

export type StaffNotificationCode =
  | "new_order"
  | "order_paid"
  | "order_confirmed"
  | "order_cancelled"
  | "order_edited"
  | "approval_required"
  | "last_minute"
  | "fresh_pick_walk_in_hold_reminder"
  | "waiting_list_new_request";

export type StaffNotificationWebMode = "transient" | "persistent";

export type StaffNotificationPreference = {
  code: StaffNotificationCode;
  webEnabled: boolean;
  webMode: StaffNotificationWebMode;
  emailEnabled: boolean;
  soundEnabled: boolean;
  pushEnabled: boolean;
};

export type StaffNotificationDefinition = {
  code: StaffNotificationCode;
  label: string;
  description: string;
};

export const STAFF_NOTIFICATION_DEFINITIONS: readonly StaffNotificationDefinition[] =
  [
    {
      code: "new_order",
      label: "New Order",
      description: "When a regular preorder is received.",
    },
    {
      code: "order_paid",
      label: "Order Paid",
      description: "When an order payment is recorded.",
    },
    {
      code: "order_confirmed",
      label: "Order Confirmed",
      description: "When a crew member marks an order Customer Confirmed.",
    },
    {
      code: "order_cancelled",
      label: "Order Cancelled",
      description: "When an order is cancelled.",
    },
    {
      code: "order_edited",
      label: "Order Edited",
      description: "When an existing order is changed.",
    },
    {
      code: "approval_required",
      label: "Approval Required",
      description: "When an action requires your approval.",
    },
    {
      code: "last_minute",
      label: "Last Minute Order",
      description: "When a new Fresh Pick order is received.",
    },
    {
      code: "fresh_pick_walk_in_hold_reminder",
      label: "Fresh Pick walk-in hold",
      description: "When a Fresh Pick walk-in hold is about to expire.",
    },
    {
      code: "waiting_list_new_request",
      label: "New waiting list request",
      description: "When a customer joins the waiting list.",
    },
  ];

export const STAFF_NOTIFICATION_DEFAULT_ENABLED = true;

export const STAFF_NOTIFICATION_DEFAULT_WEB_MODE: StaffNotificationWebMode =
  "transient";

export const STAFF_NOTIFICATION_DEFAULT_SOUND_ENABLED = false;

export const STAFF_NOTIFICATION_DEFAULT_PUSH_ENABLED = false;

export function getNotificationDefinitionsForRole(
  _role: RoleCode,
): readonly StaffNotificationDefinition[] {
  return STAFF_NOTIFICATION_DEFINITIONS;
}
