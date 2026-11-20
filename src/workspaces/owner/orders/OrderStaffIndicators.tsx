import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  fulfilmentDayPresentation,
  isFreshPickActionDueToday,
  isFreshPickOrder,
} from "@/engines/orders/staff-presentation";

export function OrderStaffIndicators({
  extraStockId,
  fulfilmentDate,
  actionRequired = false,
  terminal = false,
}: {
  extraStockId: string | null | undefined;
  fulfilmentDate: string;
  /** A concrete action from the current workspace, not a generic lifecycle inference. */
  actionRequired?: boolean;
  terminal?: boolean;
}) {
  const freshPick = isFreshPickOrder(extraStockId);
  const day = fulfilmentDayPresentation(fulfilmentDate);
  const actionDueToday = isFreshPickActionDueToday({
    extraStockId,
    fulfilmentDate,
    actionRequired,
    terminal,
  });

  return (
    <div aria-label="Order type and fulfilment timing" className="flex flex-wrap gap-1.5">
      <StatusBadge
        label={freshPick ? "Fresh Pick" : "Normal Preorder"}
        tone={freshPick ? "info" : "neutral"}
      />
      <StatusBadge
        label={day.label}
        tone={day.kind === "today" ? "warning" : "neutral"}
      />
      {actionDueToday ? (
        <StatusBadge label="Action today" tone="danger" />
      ) : null}
    </div>
  );
}
