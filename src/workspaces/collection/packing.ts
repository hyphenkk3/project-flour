/**
 * Collection packing reminders — reuse Bakery derive; local UI only.
 */

import { deriveBakeryPackingReminders } from "@/workspaces/bakery/eligibility";
import type { CollectionBoardOrder } from "@/workspaces/collection/types";
import type { CollectionPackingReminderItem } from "@/workspaces/collection/types";

export function deriveCollectionPackingReminders(
  order: CollectionBoardOrder,
): CollectionPackingReminderItem[] {
  return deriveBakeryPackingReminders(order);
}
