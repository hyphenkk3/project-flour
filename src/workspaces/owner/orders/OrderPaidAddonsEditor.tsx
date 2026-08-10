"use client";

import {
  FormCheckbox,
  FormField,
  FormInput,
  FormTextarea,
} from "@/components/ui/form";
import {
  clampPaidAddonQuantity,
  resizeWrittenMessages,
  type EditablePaidAddonDraft,
} from "@/engines/orders/paid-addons";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";

type OrderPaidAddonsEditorProps = {
  drafts: EditablePaidAddonDraft[];
  onChange: (next: EditablePaidAddonDraft[]) => void;
  /** When true, show snapshot unit price for retained lines; else catalog price. */
  preferSnapshotPrice?: boolean;
};

export function OrderPaidAddonsEditor({
  drafts,
  onChange,
  preferSnapshotPrice = false,
}: OrderPaidAddonsEditorProps) {
  function updateDraft(
    code: string,
    patch: Partial<EditablePaidAddonDraft>,
  ) {
    onChange(
      drafts.map((row) => (row.code === code ? { ...row, ...patch } : row)),
    );
  }

  if (drafts.length === 0) {
    return (
      <p className="text-skyline text-sm">
        No active add-ons are configured. Apply the paid-add-on catalog
        migration or restore Birthday Card / Wishing Card.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {drafts.map((draft) => {
        const unitPrice =
          preferSnapshotPrice && draft.snapshotUnitPrice != null
            ? draft.snapshotUnitPrice
            : draft.catalogUnitPrice;
        const quantity = clampPaidAddonQuantity(
          draft.quantity,
          draft.maxQuantity,
        );
        const messages = resizeWrittenMessages(draft.writtenMessages, quantity);
        return (
          <li
            className="border-fog space-y-3 rounded-lg border p-3"
            key={draft.code}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <FormCheckbox
                checked={draft.selected}
                label={draft.name}
                onChange={(event) => {
                  const selected = event.target.checked;
                  const nextQty = selected
                    ? clampPaidAddonQuantity(
                        draft.quantity || 1,
                        draft.maxQuantity,
                      )
                    : draft.quantity;
                  updateDraft(draft.code, {
                    selected,
                    quantity: nextQty,
                    writtenMessages: selected
                      ? resizeWrittenMessages(draft.writtenMessages, nextQty)
                      : draft.writtenMessages,
                  });
                }}
              />
              <p className="text-skyline text-sm">{formatRm(unitPrice)}/pc</p>
            </div>
            {draft.selected ? (
              <>
                <FormField label="Quantity">
                  <FormInput
                    className="w-24"
                    max={draft.maxQuantity}
                    min={1}
                    onChange={(event) => {
                      const nextQty = clampPaidAddonQuantity(
                        Number(event.target.value) || 1,
                        draft.maxQuantity,
                      );
                      updateDraft(draft.code, {
                        quantity: nextQty,
                        writtenMessages: resizeWrittenMessages(
                          draft.writtenMessages,
                          nextQty,
                        ),
                      });
                    }}
                    step={1}
                    type="number"
                    value={quantity}
                  />
                </FormField>
                <div className="space-y-3">
                  {messages.map((message, index) => (
                    <FormField
                      help="Optional."
                      key={`${draft.code}-card-${index + 1}`}
                      label={`Card ${index + 1} message`}
                    >
                      <FormTextarea
                        onChange={(event) => {
                          const next = [...messages];
                          next[index] = event.target.value;
                          updateDraft(draft.code, {
                            writtenMessages: next,
                          });
                        }}
                        rows={2}
                        value={message}
                      />
                    </FormField>
                  ))}
                </div>
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
