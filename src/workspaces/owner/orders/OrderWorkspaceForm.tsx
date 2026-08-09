"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormActions,
  FormCheckbox,
  FormError,
  FormField,
  FormInput,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import { OwnerPickupFields } from "@/components/ui/OwnerPickupFields";
import { PickupSlotFields } from "@/components/ui/PickupSlotFields";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatLongBusinessDate, formatBusinessMonthYear, isDifferentBusinessMonth } from "@/lib/dates";
import {
  describeTimelineActor,
  timelineEventLabel,
} from "@/engines/orders/timeline";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type {
  ConfirmationSnapshot,
  OrderTimelineEvent,
  StorefrontCake,
  StorefrontOrder,
} from "@/types/storefront";
import type { CollectionComplimentaryOption } from "@/workspaces/owner/orders/queries";
import {
  saveOrderWorkspaceAction,
  type OrderWorkspaceSaveState,
} from "@/workspaces/owner/orders/actions";
import { CustomerConfirmedButton } from "@/workspaces/owner/orders/CustomerConfirmedButton";
import { OrderMessagesSection } from "@/workspaces/owner/orders/OrderMessagesSection";
import { OrderOperationalControls } from "@/workspaces/owner/orders/OrderOperationalControls";
import { PaymentSection } from "@/workspaces/owner/orders/PaymentSection";
import { OrderTotalAdjustmentsSection } from "@/workspaces/owner/orders/OrderTotalAdjustmentsSection";
import {
  formatPickupTime,
  formatTimelineDateTime,
  guestOrderRequiresPhone,
  guestOrderStatusBadgeClassName,
  guestOrderStatusBadgeTone,
  guestOrderStatusLabel,
  isGuestOrderEditable,
  orderSourceLabel,
  STAFF_GUEST_ORDER_SOURCES,
} from "@/workspaces/owner/orders/labels";
import { withOwnerReturnTo } from "@/workspaces/owner/navigation/return-to";

const initialSaveState: OrderWorkspaceSaveState = {
  error: null,
  success: false,
};

type EditableItem = {
  key: string;
  cakeId: string;
  cakeSizeId: string;
  quantity: number;
};

type EditableComplimentary = {
  typeId: string | null;
  name: string;
  quantity: number;
  sortOrder: number;
};

type OrderWorkspaceFormProps = {
  order: StorefrontOrder;
  cakes: StorefrontCake[];
  complimentaryOptions: CollectionComplimentaryOption[];
  timeline: OrderTimelineEvent[];
  confirmations: ConfirmationSnapshot[];
  /** Validated Calendar return path, or null for Operations default. */
  returnTo?: string | null;
  /** Default sender for Customer Ready Message. */
  staffDisplayName: string;
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

/** Permanent staff guidance — not order-specific notes. */
function OrderGuideCallout() {
  return (
    <aside
      aria-label="Order guide"
      className="border-fog bg-mist/50 mt-4 rounded-lg border px-3 py-2.5"
    >
      <p className="text-skyline text-[0.65rem] font-semibold tracking-[0.14em] uppercase">
        Order guide
      </p>
      <ul className="text-ink mt-1.5 space-y-0.5 text-sm leading-snug">
        <li>No wording on cakes or cake boards.</li>
        <li>Customised cake decoration is not available.</li>
      </ul>
    </aside>
  );
}

export function OrderWorkspaceForm({
  order,
  cakes,
  complimentaryOptions,
  timeline,
  confirmations,
  returnTo = null,
  staffDisplayName,
}: OrderWorkspaceFormProps) {
  const router = useRouter();
  const boundSave = saveOrderWorkspaceAction.bind(null, order.id);
  const [state, formAction, pending] = useActionState(
    boundSave,
    initialSaveState,
  );

  const [mode, setMode] = useState<"view" | "edit">("view");
  const [formKey, setFormKey] = useState(0);
  const [showSaved, setShowSaved] = useState(false);
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [editComplimentary, setEditComplimentary] = useState<
    EditableComplimentary[]
  >([]);

  const canEdit = isGuestOrderEditable(order.status);
  const phoneRequired = guestOrderRequiresPhone(order.orderSource);
  const sourceLocked = order.orderSource === "customer_website";
  const [needsAttention, setNeedsAttention] = useState(
    order.needsBakeryAttention,
  );
  const [editPickupDate, setEditPickupDate] = useState(order.pickupDate);
  const [pickupMonthOverride, setPickupMonthOverride] = useState(false);

  const pickupMonthChanging = isDifferentBusinessMonth(
    order.pickupDate,
    editPickupDate,
  );

  useEffect(() => {
    if (mode !== "edit") return;
    setNeedsAttention(order.needsBakeryAttention);
    setEditPickupDate(order.pickupDate);
    setPickupMonthOverride(false);
  }, [mode, order.needsBakeryAttention, order.pickupDate, formKey]);

  useEffect(() => {
    if (!pickupMonthChanging) {
      setPickupMonthOverride(false);
    }
  }, [pickupMonthChanging]);

  useEffect(() => {
    if (!state.success) return;
    setMode("view");
    setShowSaved(true);
    router.refresh();
  }, [state, router]);

  function seedEditState() {
    setEditItems(
      order.items.map((item, index) => ({
        key: item.id || `item-${index}`,
        cakeId: item.cakeId,
        cakeSizeId: item.cakeSizeId,
        quantity: item.quantity,
      })),
    );

    if (order.complimentaryItems.length > 0) {
      setEditComplimentary(
        order.complimentaryItems.map((item) => ({
          typeId: item.complimentaryItemTypeId,
          name: item.name,
          quantity: item.quantity,
          sortOrder: item.sortOrder,
        })),
      );
    } else {
      setEditComplimentary(
        complimentaryOptions
          .filter((option) => option.isAvailable)
          .map((option) => ({
            typeId: option.typeId,
            name: option.name,
            quantity: option.isDefault ? option.defaultQuantity : 0,
            sortOrder: option.sortOrder,
          })),
      );
    }
  }

  function enterEditMode() {
    setShowSaved(false);
    seedEditState();
    setFormKey((value) => value + 1);
    setMode("edit");
  }

  function cancelEdit() {
    setMode("view");
    setFormKey((value) => value + 1);
  }

  function addCakeLine() {
    const cake = cakes[0];
    if (!cake) return;
    setEditItems((current) => [
      ...current,
      {
        key: `new-${Date.now()}`,
        cakeId: cake.id,
        cakeSizeId: cake.sizes[0]?.id ?? "",
        quantity: 1,
      },
    ]);
  }

  function updateCakeLine(key: string, patch: Partial<EditableItem>) {
    setEditItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function removeCakeLine(key: string) {
    setEditItems((current) => {
      if (current.length <= 1) return current;
      return current.filter((item) => item.key !== key);
    });
  }

  const itemsJson = useMemo(
    () =>
      JSON.stringify(
        editItems.map((item) => ({
          cakeId: item.cakeId,
          cakeSizeId: item.cakeSizeId,
          quantity: item.quantity,
        })),
      ),
    [editItems],
  );

  const complimentaryJson = useMemo(
    () => JSON.stringify(editComplimentary),
    [editComplimentary],
  );

  const activeComplimentary = order.complimentaryItems.filter(
    (item) => item.quantity > 0,
  );

  if (mode === "view") {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge
            className={guestOrderStatusBadgeClassName(order.status)}
            label={guestOrderStatusLabel(order.status)}
            tone={guestOrderStatusBadgeTone(order.status)}
          />
          <p className="text-skyline text-sm">{order.orderNumber}</p>
        </div>

        {showSaved ? (
          <p className="border-status-success/30 bg-status-success-soft text-status-success rounded-lg border px-4 py-3 text-sm">
            Changes saved
          </p>
        ) : null}

        {order.confirmationNeedsResend ? (
          <p className="border-status-warning/30 bg-status-warning-soft text-status-warning rounded-lg border px-4 py-3 text-sm">
            Confirmation needs to be resent
          </p>
        ) : null}

        <ViewBlock title="Customer">
          <div className="space-y-1">
            <p className="text-ink text-base font-semibold">{order.customerName}</p>
            <p className="text-ink text-sm">
              {order.phone.trim() ? order.phone : "No WhatsApp phone"}
            </p>
            <p className="text-skyline text-sm">
              {order.email.trim() ? order.email : "No email"}
            </p>
            <p className="text-skyline text-sm">
              Source · {orderSourceLabel(order.orderSource)}
              {order.crewOrder ? " · Crew order" : ""}
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

        <ViewBlock title="Order">
          <ul className="space-y-2">
            {order.items.map((item) => (
              <li key={item.id}>
                <p className="text-ink font-medium">{item.cakeName}</p>
                <p className="text-skyline text-sm">
                  {item.sizeLabel} × {item.quantity} ·{" "}
                  {formatRm(item.unitPrice * item.quantity)}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-ink mt-3 text-sm font-semibold">
            Total · {formatRm(order.total)}
          </p>
          <OrderGuideCallout />
        </ViewBlock>

        <ViewBlock title="Complimentary items">
          {activeComplimentary.length === 0 ? (
            <p className="text-skyline text-sm">None</p>
          ) : (
            <ul className="text-ink space-y-1 text-sm">
              {activeComplimentary.map((item) => (
                <li key={item.id}>
                  {item.name} × {item.quantity}
                </li>
              ))}
            </ul>
          )}
          <p className="text-skyline mt-3 text-sm">
            Include receipt · {order.includeReceipt ? "Yes" : "No"}
          </p>
        </ViewBlock>

        {order.status === "submitted" ||
        order.status === "pending_confirmation" ? (
          <OrderTotalAdjustmentsSection order={order} />
        ) : null}

        {order.status === "awaiting_payment" || order.status === "paid" ? (
          <PaymentSection order={order} returnTo={returnTo} />
        ) : null}

        <ViewBlock title="Collection">
          <OrderOperationalControls
            compact
            onSuccess={() => {
              router.refresh();
            }}
            orderId={order.id}
            pickedUpAt={order.pickedUpAt}
            readyAt={order.readyAt}
          />
        </ViewBlock>

        <ViewBlock title="Messages">
          <OrderMessagesSection
            compact
            order={order}
            staffDisplayName={staffDisplayName}
          />
        </ViewBlock>

        <ViewBlock title="Internal notes">
          <p className="text-skyline text-sm leading-relaxed whitespace-pre-wrap">
            {order.internalNotes?.trim()
              ? order.internalNotes
              : "No internal notes."}
          </p>
        </ViewBlock>

        <ViewBlock title="Bakery attention">
          {order.needsBakeryAttention ? (
            <div className="space-y-1">
              <p className="text-ink text-sm font-medium">Needs attention</p>
              <p className="text-skyline text-sm leading-relaxed whitespace-pre-wrap">
                {order.bakeryAttentionNote?.trim()
                  ? order.bakeryAttentionNote
                  : "No attention note."}
              </p>
            </div>
          ) : (
            <p className="text-skyline text-sm">No bakery attention flag.</p>
          )}
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
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium"
              href={withOwnerReturnTo(
                `/owner/orders/${order.id}/confirmation`,
                returnTo,
              )}
            >
              Prepare Confirmation
            </Link>
          ) : null}

          {order.status === "pending_confirmation" &&
          order.confirmationNeedsResend ? (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium"
              href={withOwnerReturnTo(
                `/owner/orders/${order.id}/confirmation?updated=1`,
                returnTo,
              )}
            >
              Prepare Updated Confirmation
            </Link>
          ) : null}

          {order.status === "pending_confirmation" &&
          !order.confirmationNeedsResend ? (
            <CustomerConfirmedButton orderId={order.id} />
          ) : null}
        </div>

        <ViewBlock title="Timeline">
          {timeline.length === 0 ? (
            <p className="text-skyline text-sm">No events yet.</p>
          ) : (
            <ol className="space-y-3">
              {timeline.map((event) => (
                <li className="text-sm" key={event.id}>
                  <p className="text-ink font-medium">
                    {timelineEventLabel(event.eventType)}
                  </p>
                  <p className="text-skyline">
                    {formatTimelineDateTime(event.createdAt)}
                    {" · "}
                    {describeTimelineActor(event.eventType, event.actorName)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </ViewBlock>

        {confirmations.length > 0 ? (
          <ViewBlock title="Confirmation history">
            <ul className="space-y-4">
              {[...confirmations].reverse().map((snapshot) => (
                <li key={snapshot.id}>
                  <p className="text-ink text-sm font-medium">
                    Version {snapshot.version}
                    {" · "}
                    {snapshot.lifecycleStatus === "sent"
                      ? "Sent"
                      : "Outdated"}
                    {snapshot.sentAt
                      ? ` · ${formatTimelineDateTime(snapshot.sentAt)}`
                      : null}
                  </p>
                  <pre className="border-fog text-skyline mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border bg-mist/40 p-3 text-xs leading-relaxed">
                    {snapshot.messageBody}
                  </pre>
                </li>
              ))}
            </ul>
          </ViewBlock>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6" key={formKey}>
      <input name="items_json" type="hidden" value={itemsJson} />
      <input name="complimentary_json" type="hidden" value={complimentaryJson} />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge
          className={guestOrderStatusBadgeClassName(order.status)}
          label={guestOrderStatusLabel(order.status)}
          tone={guestOrderStatusBadgeTone(order.status)}
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
          <FormField
            help={
              phoneRequired
                ? "Required for website storefront orders."
                : "Optional for staff-created orders."
            }
            htmlFor="guest_phone"
            label={
              phoneRequired ? "WhatsApp phone" : "WhatsApp phone (optional)"
            }
          >
            <FormInput
              defaultValue={order.phone}
              id="guest_phone"
              name="guest_phone"
              required={phoneRequired}
              type="tel"
            />
          </FormField>
          <FormField
            help="Optional. Used only if the customer shared an email."
            htmlFor="guest_email"
            label="Email (optional)"
          >
            <FormInput
              defaultValue={order.email}
              id="guest_email"
              name="guest_email"
              type="email"
            />
          </FormField>
        </div>
        {sourceLocked ? (
          <p className="text-skyline text-sm">
            Source · Customer website (locked — storefront origin)
          </p>
        ) : (
          <FormField htmlFor="order_source" label="Order source">
            <FormSelect
              defaultValue={order.orderSource}
              id="order_source"
              name="order_source"
              required
            >
              {STAFF_GUEST_ORDER_SOURCES.map((source) => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
              {order.orderSource === "walk_in" ||
              order.orderSource === "last_minute" ? (
                <option value={order.orderSource}>
                  {orderSourceLabel(order.orderSource)}
                </option>
              ) : null}
            </FormSelect>
          </FormField>
        )}
        <FormCheckbox
          defaultChecked={order.crewOrder}
          help="Shows as (crew) later. Does not change payment or discounts."
          label="Crew order"
          name="crew_order"
          value="1"
        />
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Pickup
        </h2>
        {sourceLocked ? (
          <PickupSlotFields
            defaultDate={order.pickupDate}
            defaultTime={order.pickupTime}
            onDateChange={setEditPickupDate}
          />
        ) : (
          <OwnerPickupFields
            defaultDate={order.pickupDate}
            defaultTime={order.pickupTime}
            onDateChange={setEditPickupDate}
          />
        )}
        {pickupMonthChanging ? (
          <div className="border-status-warning/30 bg-status-warning-soft space-y-3 rounded-lg border px-4 py-3">
            <p className="text-status-warning text-sm">
              This changes the pickup month from{" "}
              {formatBusinessMonthYear(order.pickupDate)} to{" "}
              {formatBusinessMonthYear(editPickupDate)}.
            </p>
            <label className="text-ink flex items-start gap-2 text-sm">
              <input
                checked={pickupMonthOverride}
                className="mt-0.5"
                name="pickup_month_override"
                onChange={(event) =>
                  setPickupMonthOverride(event.target.checked)
                }
                required
                type="checkbox"
                value="1"
              />
              <span>
                Owner override — allow pickup month change
              </span>
            </label>
          </div>
        ) : (
          <input name="pickup_month_override" type="hidden" value="0" />
        )}
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
            Order
          </h2>
          <button
            className="text-signal text-sm font-medium"
            onClick={addCakeLine}
            type="button"
          >
            + Add cake
          </button>
        </div>
        <ul className="space-y-4">
          {editItems.map((item) => {
            const cake =
              cakes.find((entry) => entry.id === item.cakeId) ?? cakes[0];
            return (
              <li
                className="border-fog space-y-3 rounded-lg border p-3"
                key={item.key}
              >
                <FormField label="Cake">
                  <FormSelect
                    onChange={(event) => {
                      const nextCake = cakes.find(
                        (entry) => entry.id === event.target.value,
                      );
                      updateCakeLine(item.key, {
                        cakeId: event.target.value,
                        cakeSizeId: nextCake?.sizes[0]?.id ?? "",
                      });
                    }}
                    value={item.cakeId}
                  >
                    {cakes.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </FormSelect>
                </FormField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Size">
                    <FormSelect
                      onChange={(event) =>
                        updateCakeLine(item.key, {
                          cakeSizeId: event.target.value,
                        })
                      }
                      value={item.cakeSizeId}
                    >
                      {(cake?.sizes ?? []).map((size) => (
                        <option key={size.id} value={size.id}>
                          {size.size} — {formatRm(size.price)}
                        </option>
                      ))}
                    </FormSelect>
                  </FormField>
                  <FormField label="Quantity">
                    <FormInput
                      min={1}
                      onChange={(event) =>
                        updateCakeLine(item.key, {
                          quantity: Math.max(
                            1,
                            Number(event.target.value) || 1,
                          ),
                        })
                      }
                      step={1}
                      type="number"
                      value={item.quantity}
                    />
                  </FormField>
                </div>
                {editItems.length > 1 ? (
                  <button
                    className="text-skyline hover:text-ink text-xs font-medium"
                    onClick={() => removeCakeLine(item.key)}
                    type="button"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        <OrderGuideCallout />
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Complimentary items
        </h2>
        <ul className="space-y-3">
          {editComplimentary.map((item, index) => (
            <li
              className="flex items-center justify-between gap-3"
              key={`${item.name}-${index}`}
            >
              <span className="text-ink text-sm">{item.name}</span>
              <FormInput
                aria-label={`${item.name} quantity`}
                className="w-24"
                min={0}
                onChange={(event) => {
                  const quantity = Math.max(0, Number(event.target.value) || 0);
                  setEditComplimentary((current) =>
                    current.map((entry, i) =>
                      i === index ? { ...entry, quantity } : entry,
                    ),
                  );
                }}
                step={1}
                type="number"
                value={item.quantity}
              />
            </li>
          ))}
        </ul>
        <FormCheckbox
          defaultChecked={order.includeReceipt}
          help="Physical purchase receipt with the cake at pickup."
          label="Include receipt"
          name="include_receipt"
          value="1"
        />
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Collection
        </h2>
        <OrderOperationalControls
          compact
          onSuccess={() => {
            router.refresh();
          }}
          orderId={order.id}
          pickedUpAt={order.pickedUpAt}
          readyAt={order.readyAt}
        />
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Messages
        </h2>
        <OrderMessagesSection
          compact
          order={order}
          staffDisplayName={staffDisplayName}
        />
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Internal notes
        </h2>
        {/* Preserve existing customer_notes on save — field hidden from UI. */}
        <input
          name="customer_notes"
          type="hidden"
          value={order.notes ?? ""}
        />
        <FormField htmlFor="internal_notes" label="Internal notes">
          <FormTextarea
            defaultValue={order.internalNotes ?? ""}
            id="internal_notes"
            name="internal_notes"
            rows={3}
          />
        </FormField>
      </section>

      <section className="border-fog space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Bakery attention
        </h2>
        <FormCheckbox
          checked={needsAttention}
          label="Needs bakery attention"
          name="needs_bakery_attention"
          onChange={(event) => setNeedsAttention(event.target.checked)}
          value="1"
        />
        {needsAttention ? (
          <FormField
            htmlFor="bakery_attention_note"
            label="Attention note"
          >
            <FormInput
              defaultValue={order.bakeryAttentionNote ?? ""}
              id="bakery_attention_note"
              name="bakery_attention_note"
              placeholder="Early pickup, less sweet, special handling…"
            />
          </FormField>
        ) : null}
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
