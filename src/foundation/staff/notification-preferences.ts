import type { RoleCode } from "@/types/staff";

export type StaffNotificationCode =
  | "new_order"
  | "order_paid"
  | "order_confirmed"
  | "order_cancelled"
  | "order_edited"
  | "approval_required"
  | "guest_preorder";

export type StaffNotificationPreference = {
  code: StaffNotificationCode;
  emailEnabled: boolean;
};

export type StaffNotificationDefinition = {
  code: StaffNotificationCode;
  label: string;
  description: string;
};

export const STAFF_NOTIFICATION_DEFINITIONS: readonly StaffNotificationDefinition[] = [
  {
    code: "new_order",
    label: "New order",
    description: "When a new order is placed.",
  },
  {
    code: "order_paid",
    label: "Order paid",
    description: "When an order payment is recorded.",
  },
  {
    code: "order_confirmed",
    label: "Order confirmed",
    description: "When an order is confirmed.",
  },
  {
    code: "order_cancelled",
    label: "Order cancelled",
    description: "When an order is cancelled.",
  },
  {
    code: "order_edited",
    label: "Order edited",
    description: "When an existing order is changed.",
  },
  {
    code: "approval_required",
    label: "Approval required",
    description: "When an action requires your approval.",
  },
  {
    code: "guest_preorder",
    label: "Guest preorder",
    description: "When a guest preorder is submitted.",
  },
];

export const STAFF_NOTIFICATION_DEFAULT_ENABLED = true;

/**
 * Future role-aware filtering can be added here without changing
 * the stored preference model.
 */
export function getNotificationDefinitionsForRole(
  _role: RoleCode,
): readonly StaffNotificationDefinition[] {
  return STAFF_NOTIFICATION_DEFINITIONS;
}
