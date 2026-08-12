"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  MISSING_DELIVERY_FEE_ADD_ACTION,
  MISSING_DELIVERY_FEE_BEFORE_CONFIRMATION_BODY,
  MISSING_DELIVERY_FEE_BEFORE_CONFIRMATION_TITLE,
  MISSING_DELIVERY_FEE_CONTINUE_ACTION,
} from "@/engines/orders/confirmation-validity";

type MissingDeliveryFeeConfirmationDialogProps = {
  open: boolean;
  onAddDeliveryFee: () => void;
  onContinueWithout: () => void;
};

export function MissingDeliveryFeeConfirmationDialog({
  open,
  onAddDeliveryFee,
  onContinueWithout,
}: MissingDeliveryFeeConfirmationDialogProps) {
  return (
    <ConfirmDialog
      allowDismiss={false}
      cancelLabel={MISSING_DELIVERY_FEE_CONTINUE_ACTION}
      confirmLabel={MISSING_DELIVERY_FEE_ADD_ACTION}
      description={MISSING_DELIVERY_FEE_BEFORE_CONFIRMATION_BODY}
      onCancel={onContinueWithout}
      onConfirm={onAddDeliveryFee}
      open={open}
      title={MISSING_DELIVERY_FEE_BEFORE_CONFIRMATION_TITLE}
    />
  );
}
