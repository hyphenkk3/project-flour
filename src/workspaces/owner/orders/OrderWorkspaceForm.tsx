"use client";

import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  FormActions,
  FormError,
  FormField,
  FormInput,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import { PickupSlotFields } from "@/components/ui/PickupSlotFields";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatLongBusinessDate } from "@/lib/dates";
import type { StorefrontCake, StorefrontOrder } from "@/types/storefront";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  saveOrderWorkspaceAction,
  type OrderWorkspaceSaveState,
} from "@/workspaces/owner/orders/actions";
import { ConfirmOrderButton } from "@/workspaces/owner/orders/ConfirmOrderButton";
import {
  formatPickupTime,
  guestOrderStatusLabel,
} from "@/workspaces/owner/orders/labels";

const initialSaveState: OrderWorkspaceSaveState = {
  error: null,
  success: false,
};

type OrderWorkspaceFormProps = {
  order: StorefrontOrder;
  cakes: StorefrontCake[];
};

function ViewBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-fog space-y-3 rounded-xl border bg-white p-5">
      <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function OrderWorkspaceForm({ order, cakes }: OrderWorkspaceFormProps) {
  const router = useRouter();
  const item = order.items[0];
  const boundSave = saveOrderWorkspaceAction.bind(null, order.id);
  const [state, formAction, pending] = useActionState(
    boundSave,
    initialSaveState,
  );

  const [mode, setMode] = useState<"view" | "edit">("view");
  const [formKey, setFormKey] = useState(0);
  const [showSaved, setShowSaved] = useState(false);

  const initialCakeId = item?.cakeId ?? cakes[0]?.id ?? "";
  const [cakeId, setCakeId] = useState(initialCakeId);

  const selectedCake = useMemo(
    () => cakes.find((cake) => cake.id === cakeId) ?? null,
    [cakes, cakeId],
  );

  const [sizeId, setSizeId] = useState(
    item?.cakeSizeId ?? selectedCake?.sizes[0]?.id ?? "",
  );

  useEffect(() => {
    if (!selectedCake) return;
    const stillValid = selectedCake.sizes.some((size) => size.id === sizeId);
    if (!stillValid) {
      setSizeId(selectedCake.sizes[0]?.id ?? "");
    }
  }, [selectedCake, sizeId]);

  useEffect(() => {
    if (!state.success) return;
    setMode("view");
    setShowSaved(true);
    router.refresh();
  }, [state, router]);

  useEffect(() => {
    setCakeId(item?.cakeId ?? cakes[0]?.id ?? "");
    setSizeId(item?.cakeSizeId ?? "");
  }, [order, item?.cakeId, item?.cakeSizeId, cakes]);

  const canEdit =
    order.status === "submitted" || order.status === "pending_confirmation";

  function enterEditMode() {
    setShowSaved(false);
    setCakeId(item?.cakeId ?? cakes[0]?.id ?? "");
    setSizeId(item?.cakeSizeId ?? selectedCake?.sizes[0]?.id ?? "");
    setFormKey((value) => value + 1);
    setMode("edit");
  }

  function cancelEdit() {
    setMode("view");
    setFormKey((value) => value + 1);
  }

  if (mode === "view") {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge
            label={guestOrderStatusLabel(order.status)}
            tone={order.status === "submitted" ? "warning" : "info"}
          />
          <p className="text-skyline text-sm">{order.orderNumber}</p>
        </div>

        {showSaved ? (
          <p className="border-status-success/30 bg-status-success-soft text-status-success rounded-lg border px-4 py-3 text-sm">
            Changes saved
          </p>
        ) : null}

        <ViewBlock title="Customer">
          <div className="space-y-1">
            <p className="text-ink text-base font-semibold">{order.customerName}</p>
            <p className="text-ink text-sm">{order.phone}</p>
            <p className="text-skyline text-sm">{order.email}</p>
          </div>
        </ViewBlock>

        <ViewBlock title="Order">
          <div className="space-y-1">
            <p className="text-ink text-base font-semibold">
              {item?.cakeName ?? "—"}
            </p>
            <p className="text-ink text-sm">
              {item
                ? `${item.sizeLabel} · ${formatRm(item.unitPrice)}`
                : "—"}
            </p>
            <p className="text-skyline text-sm">
              Quantity {item?.quantity ?? 1}
            </p>
          </div>
        </ViewBlock>

        <ViewBlock title="Pickup">
          <div className="space-y-1">
            <p className="text-ink text-base font-semibold">
              {formatLongBusinessDate(order.pickupDate)}
            </p>
            <p className="text-ink text-sm">
              {formatPickupTime(order.pickupTime)}
            </p>
          </div>
        </ViewBlock>

        <ViewBlock title="Customer notes">
          <p className="text-skyline text-sm leading-relaxed whitespace-pre-wrap">
            {order.notes?.trim() ? order.notes : "No notes provided."}
          </p>
        </ViewBlock>

        <ViewBlock title="Internal notes">
          <p className="text-skyline text-sm leading-relaxed whitespace-pre-wrap">
            {order.internalNotes?.trim()
              ? order.internalNotes
              : "No internal notes."}
          </p>
        </ViewBlock>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {canEdit ? (
            <button
              className="border-fog text-ink hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
              onClick={enterEditMode}
              type="button"
            >
              Edit Order
            </button>
          ) : null}
          {order.status === "submitted" ? (
            <ConfirmOrderButton orderId={order.id} />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6" key={formKey}>
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge
          label={guestOrderStatusLabel(order.status)}
          tone={order.status === "submitted" ? "warning" : "info"}
        />
        <p className="text-skyline text-sm">{order.orderNumber}</p>
      </div>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Customer
        </h2>
        <FormField htmlFor="guest_name" label="Name">
          <FormInput
            defaultValue={order.customerName}
            id="guest_name"
            name="guest_name"
            required
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="guest_phone" label="Phone">
            <FormInput
              defaultValue={order.phone}
              id="guest_phone"
              name="guest_phone"
              required
              type="tel"
            />
          </FormField>
          <FormField htmlFor="guest_email" label="Email">
            <FormInput
              defaultValue={order.email}
              id="guest_email"
              name="guest_email"
              required
              type="email"
            />
          </FormField>
        </div>
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Order
        </h2>
        <FormField htmlFor="cake_id" label="Cake">
          <FormSelect
            id="cake_id"
            name="cake_id"
            onChange={(event) => setCakeId(event.target.value)}
            required
            value={cakeId}
          >
            {cakes.map((cake) => (
              <option key={cake.id} value={cake.id}>
                {cake.name}
              </option>
            ))}
          </FormSelect>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="cake_size_id" label="Size">
            <FormSelect
              disabled={!selectedCake}
              id="cake_size_id"
              name="cake_size_id"
              onChange={(event) => setSizeId(event.target.value)}
              required
              value={sizeId}
            >
              {(selectedCake?.sizes ?? []).map((size) => (
                <option key={size.id} value={size.id}>
                  {size.size} — {formatRm(size.price)}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormField htmlFor="quantity" label="Quantity">
            <FormInput
              defaultValue={item?.quantity ?? 1}
              id="quantity"
              min={1}
              name="quantity"
              required
              step={1}
              type="number"
            />
          </FormField>
        </div>
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Pickup
        </h2>
        <PickupSlotFields
          defaultDate={order.pickupDate}
          defaultTime={order.pickupTime}
        />
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Notes
        </h2>
        <FormField htmlFor="customer_notes" label="Customer notes">
          <FormTextarea
            defaultValue={order.notes ?? ""}
            id="customer_notes"
            name="customer_notes"
            rows={3}
          />
        </FormField>
        <FormField htmlFor="internal_notes" label="Internal notes">
          <FormTextarea
            defaultValue={order.internalNotes ?? ""}
            id="internal_notes"
            name="internal_notes"
            rows={3}
          />
        </FormField>
      </section>

      <FormError message={state.error} />

      <FormActions>
        <FormSubmitButton pending={pending}>Save Changes</FormSubmitButton>
        <button
          className="border-fog text-ink hover:bg-mist inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
          disabled={pending}
          onClick={cancelEdit}
          type="button"
        >
          Cancel
        </button>
      </FormActions>
    </form>
  );
}
