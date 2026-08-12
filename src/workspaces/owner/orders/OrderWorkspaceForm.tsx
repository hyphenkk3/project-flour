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
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatLongBusinessDate, formatBusinessMonthYear, isDifferentBusinessMonth } from "@/lib/dates";
import {
  describeTimelineActor,
  timelineEventLabel,
} from "@/engines/orders/timeline";
import {
  shouldOfferUpdatedConfirmationAction,
  shouldWarnMissingDeliveryFeeBeforeConfirmation,
} from "@/engines/orders/confirmation-validity";
import {
  buildEditablePaidAddonDrafts,
  paidAddonDraftsToMutationPayload,
  type EditablePaidAddonDraft,
} from "@/engines/orders/paid-addons";
import {
  buildWorkspaceFulfilmentViewModel,
  deliveryDraftFromPersistedOrder,
  normalizeOwnerCreateFulfilmentMethod,
  type DeliveryCreateDraft,
  type OwnerCreateFulfilmentMethod,
} from "@/engines/orders/fulfilment";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type {
  ConfirmationSnapshot,
  OrderTimelineEvent,
  PaidAddonType,
  StorefrontCake,
  StorefrontOrder,
} from "@/types/storefront";
import type { CollectionComplimentaryOption } from "@/workspaces/owner/orders/queries";
import {
  saveOrderWorkspaceAction,
  type OrderWorkspaceSaveState,
} from "@/workspaces/owner/orders/actions";
import {
  deliveryChargesRemovalWarning,
  deliveryFinanceFactsFromDelivery,
} from "@/engines/orders/delivery-finance";
import { pendingFeeRequestAttentionCopy } from "@/engines/orders/delivery-fee-request-attribution";
import type { GuestOrderWorkspaceCapabilities } from "@/engines/orders/delivery-finance-capabilities";
import { CustomerConfirmedButton } from "@/workspaces/owner/orders/CustomerConfirmedButton";
import { DeliveryChargesSection } from "@/workspaces/owner/orders/DeliveryChargesSection";
import { MissingDeliveryFeeConfirmationDialog } from "@/workspaces/owner/orders/MissingDeliveryFeeConfirmationDialog";
import {
  acknowledgeMissingDeliveryFeeBeforeConfirmation,
  focusDeliveryChargesSection,
} from "@/workspaces/owner/orders/missing-delivery-fee-confirmation";
import { EnableDeliveryChargesControl } from "@/workspaces/owner/orders/EnableDeliveryChargesControl";
import { OrderFulfilmentCreateFields } from "@/workspaces/owner/orders/OrderFulfilmentCreateFields";
import { OrderMessagesSection } from "@/workspaces/owner/orders/OrderMessagesSection";
import { operationalSectionTitle } from "@/engines/orders/operational-state";
import { OrderOperationalControls } from "@/workspaces/owner/orders/OrderOperationalControls";
import { OrderPaidAddonsEditor } from "@/workspaces/owner/orders/OrderPaidAddonsEditor";
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
  paidAddonCatalog: PaidAddonType[];
  timeline: OrderTimelineEvent[];
  confirmations: ConfirmationSnapshot[];
  /** Validated Calendar return path, or null for Operations default. */
  returnTo?: string | null;
  /** Default sender for Customer Ready Message. */
  staffDisplayName: string;
  /** Role-aware gates for shared guest Order Workspace (2B-1). */
  capabilities: GuestOrderWorkspaceCapabilities;
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
  paidAddonCatalog,
  timeline,
  confirmations,
  returnTo = null,
  staffDisplayName,
  capabilities,
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
  const [editPaidAddons, setEditPaidAddons] = useState<
    EditablePaidAddonDraft[]
  >([]);
  const [editGuestName, setEditGuestName] = useState(order.customerName);
  const [editGuestPhone, setEditGuestPhone] = useState(order.phone);
  const [editFulfilmentMethod, setEditFulfilmentMethod] =
    useState<OwnerCreateFulfilmentMethod>(() =>
      normalizeOwnerCreateFulfilmentMethod(order.fulfilmentMethod),
    );
  const [editDeliveryDraft, setEditDeliveryDraft] = useState<DeliveryCreateDraft>(
    () =>
      deliveryDraftFromPersistedOrder({
        customerName: order.customerName,
        customerPhone: order.phone,
        fulfilmentMethod: order.fulfilmentMethod,
        delivery: order.delivery,
      }),
  );

  const canEdit =
    capabilities.canEditOrderWorkspace && isGuestOrderEditable(order.status);
  const phoneRequired = guestOrderRequiresPhone(order.orderSource);
  const sourceLocked = order.orderSource === "customer_website";
  const fulfilmentView = buildWorkspaceFulfilmentViewModel(order);
  const [needsAttention, setNeedsAttention] = useState(
    order.needsBakeryAttention,
  );
  const [editPickupDate, setEditPickupDate] = useState(order.pickupDate);
  const [pickupMonthOverride, setPickupMonthOverride] = useState(false);

  const pickupMonthChanging = isDifferentBusinessMonth(
    order.pickupDate,
    editPickupDate,
  );
  const deliveryToPickupWarning = (() => {
    if (editFulfilmentMethod !== "pickup") return null;
    if (order.fulfilmentMethod !== "delivery") return null;
    const warning = deliveryChargesRemovalWarning(
      deliveryFinanceFactsFromDelivery(order.delivery),
    );
    if (!warning.hasRemovableCharges) return null;
    return warning;
  })();
  const hasVerifiedPayment = order.settlement.netReceived > 0;
  const feeAttentionCopy =
    capabilities.canResolveFeeRequests && order.delivery
      ? pendingFeeRequestAttentionCopy({
          deliveryPending:
            order.delivery.deliveryFeeRequest.status === "pending",
          processingPending:
            order.delivery.processingFeeRequest.status === "pending",
          processingKind: order.delivery.processingFeeRequest.kind,
        })
      : null;
  const [missingFeeConfirmationHref, setMissingFeeConfirmationHref] = useState<
    string | null
  >(null);

  function confirmationHref(updated: boolean): string {
    return withOwnerReturnTo(
      updated
        ? `/owner/orders/${order.id}/confirmation?updated=1`
        : `/owner/orders/${order.id}/confirmation`,
      returnTo,
    );
  }

  function handlePrepareConfirmation(updated: boolean) {
    const href = confirmationHref(updated);
    if (shouldWarnMissingDeliveryFeeBeforeConfirmation(order)) {
      setMissingFeeConfirmationHref(href);
      return;
    }
    router.push(href);
  }

  function handleAddDeliveryFeeFromConfirmationWarning() {
    setMissingFeeConfirmationHref(null);
    requestAnimationFrame(() => {
      focusDeliveryChargesSection();
    });
  }

  function handleContinueWithoutDeliveryFeeFromWorkspace() {
    const href = missingFeeConfirmationHref;
    setMissingFeeConfirmationHref(null);
    if (!href) return;
    acknowledgeMissingDeliveryFeeBeforeConfirmation(order.id);
    router.push(href);
  }
  const deliveryJson = useMemo(
    () => JSON.stringify(editDeliveryDraft),
    [editDeliveryDraft],
  );

  useEffect(() => {
    if (mode !== "edit") return;
    setNeedsAttention(order.needsBakeryAttention);
    setEditPickupDate(order.pickupDate);
    setPickupMonthOverride(false);
    setEditGuestName(order.customerName);
    setEditGuestPhone(order.phone);
    setEditFulfilmentMethod(
      normalizeOwnerCreateFulfilmentMethod(order.fulfilmentMethod),
    );
    setEditDeliveryDraft(
      deliveryDraftFromPersistedOrder({
        customerName: order.customerName,
        customerPhone: order.phone,
        fulfilmentMethod: order.fulfilmentMethod,
        delivery: order.delivery,
      }),
    );
  }, [
    mode,
    order.needsBakeryAttention,
    order.pickupDate,
    order.customerName,
    order.phone,
    order.fulfilmentMethod,
    order.delivery,
    formKey,
  ]);

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

    setEditPaidAddons(
      buildEditablePaidAddonDrafts({
        catalog: paidAddonCatalog,
        existing: order.paidAddons ?? [],
      }),
    );
    setEditGuestName(order.customerName);
    setEditGuestPhone(order.phone);
    setEditFulfilmentMethod(
      normalizeOwnerCreateFulfilmentMethod(order.fulfilmentMethod),
    );
    setEditDeliveryDraft(
      deliveryDraftFromPersistedOrder({
        customerName: order.customerName,
        customerPhone: order.phone,
        fulfilmentMethod: order.fulfilmentMethod,
        delivery: order.delivery,
      }),
    );
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

  const paidAddonsJson = useMemo(
    () => JSON.stringify(paidAddonDraftsToMutationPayload(editPaidAddons)),
    [editPaidAddons],
  );

  const activeComplimentary = order.complimentaryItems.filter(
    (item) => item.quantity > 0,
  );
  const orderPaidAddons = order.paidAddons ?? [];

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
            Previous confirmation is outdated — customer reconfirmation required
          </p>
        ) : null}

        {feeAttentionCopy ? (
          <p className="border-status-warning/30 bg-status-warning-soft text-ink rounded-lg border px-4 py-3 text-sm">
            {feeAttentionCopy}
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

        <ViewBlock title={fulfilmentView.sectionTitle}>
          {fulfilmentView.isDelivery ? (
            <div className="space-y-1">
              <p className="text-skyline text-xs font-medium tracking-wide uppercase">
                {fulfilmentView.dateLabel}
              </p>
              <p className="text-ink text-base font-semibold">
                {formatLongBusinessDate(order.pickupDate)}
              </p>
              <p className="text-skyline mt-2 text-xs font-medium tracking-wide uppercase">
                {fulfilmentView.timeLabel}
              </p>
              <p className="text-ink text-sm">
                {formatPickupTime(order.pickupTime)}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-ink text-base font-semibold">
                {formatLongBusinessDate(order.pickupDate)}
              </p>
              <p className="text-ink text-sm">
                {formatPickupTime(order.pickupTime)}
              </p>
            </div>
          )}
          {fulfilmentView.isDelivery && fulfilmentView.delivery ? (
            <div className="border-fog mt-4 space-y-2 border-t pt-4">
              <p className="text-ink text-sm">
                <span className="text-skyline">Recipient · </span>
                {fulfilmentView.delivery.recipientName}
              </p>
              <p className="text-ink text-sm">
                <span className="text-skyline">Phone · </span>
                {fulfilmentView.delivery.recipientPhone}
              </p>
              <p className="text-ink text-sm">
                {fulfilmentView.delivery.addressLine1}
              </p>
              {fulfilmentView.delivery.addressLine2 ? (
                <p className="text-ink text-sm">
                  {fulfilmentView.delivery.addressLine2}
                </p>
              ) : null}
              <p className="text-ink text-sm">
                {fulfilmentView.delivery.postcode}{" "}
                {fulfilmentView.delivery.city}
              </p>
              <p className="text-ink text-sm">
                {fulfilmentView.delivery.state}
              </p>
              {fulfilmentView.notifyLabel ? (
                <p className="text-ink text-sm">
                  <span className="text-skyline">Notify · </span>
                  {fulfilmentView.notifyLabel}
                </p>
              ) : null}
              <div className="mt-3">
                {capabilities.canEnableDeliveryFinance ? (
                  <EnableDeliveryChargesControl order={order} />
                ) : null}
              </div>
            </div>
          ) : null}
        </ViewBlock>

        <DeliveryChargesSection
          capabilities={capabilities}
          order={order}
        />

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

        <ViewBlock title="Add-ons">
          {orderPaidAddons.length === 0 ? (
            <p className="text-skyline text-sm">No add-ons.</p>
          ) : (
            <ul className="space-y-3">
              {orderPaidAddons.map((addon) => {
                const visibleMessages = (addon.messages ?? [])
                  .filter((m) => Boolean(m.writtenMessage?.trim()))
                  .sort((a, b) => a.cardIndex - b.cardIndex);
                // Legacy single-message fallback before child rows exist.
                if (
                  visibleMessages.length === 0 &&
                  addon.writtenMessage?.trim()
                ) {
                  visibleMessages.push({
                    cardIndex: 1,
                    writtenMessage: addon.writtenMessage.trim(),
                  });
                }
                return (
                  <li key={addon.id}>
                    <p className="text-ink font-medium">
                      {addon.name} ×{addon.quantity}
                    </p>
                    <p className="text-skyline text-sm">
                      {formatRm(addon.unitPrice)}/pc
                    </p>
                    {visibleMessages.length > 0 ? (
                      <ul className="text-ink mt-1 space-y-0.5 text-sm">
                        {visibleMessages.map((m) => (
                          <li key={`${addon.id}-${m.cardIndex}`}>
                            Card {m.cardIndex}: {m.writtenMessage?.trim()}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
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

        {capabilities.canManageDiscounts &&
        (order.status === "submitted" ||
          order.status === "pending_confirmation") ? (
          <OrderTotalAdjustmentsSection order={order} />
        ) : null}

        {capabilities.canManagePayments &&
        (order.status === "awaiting_payment" || order.status === "paid") ? (
          <PaymentSection order={order} returnTo={returnTo} />
        ) : null}

        {capabilities.canOperateCollectionControls ? (
          <ViewBlock title={operationalSectionTitle(order.fulfilmentMethod)}>
            <OrderOperationalControls
              compact
              fulfilmentMethod={order.fulfilmentMethod}
              deliveredAt={order.deliveredAt}
              orderId={order.id}
              outForDeliveryAt={order.outForDeliveryAt}
              pickedUpAt={order.pickedUpAt}
              readyAt={order.readyAt}
            />
          </ViewBlock>
        ) : null}

        {capabilities.canEditOrderWorkspace ? (
          <ViewBlock title="Messages">
            <OrderMessagesSection
              compact
              order={order}
              staffDisplayName={staffDisplayName}
            />
          </ViewBlock>
        ) : null}

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

          {capabilities.canPrepareConfirmation &&
          order.status === "submitted" ? (
            <button
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium"
              onClick={() => handlePrepareConfirmation(false)}
              type="button"
            >
              Prepare Confirmation
            </button>
          ) : null}

          {capabilities.canPrepareConfirmation &&
          shouldOfferUpdatedConfirmationAction({
            status: order.status,
            confirmationNeedsResend: order.confirmationNeedsResend,
          }) ? (
            <button
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium"
              onClick={() => handlePrepareConfirmation(true)}
              type="button"
            >
              Prepare Updated Confirmation
            </button>
          ) : null}

          {capabilities.canPrepareConfirmation &&
          order.status === "pending_confirmation" &&
          !order.confirmationNeedsResend ? (
            <CustomerConfirmedButton orderId={order.id} />
          ) : null}
        </div>

        <MissingDeliveryFeeConfirmationDialog
          onAddDeliveryFee={handleAddDeliveryFeeFromConfirmationWarning}
          onContinueWithout={handleContinueWithoutDeliveryFeeFromWorkspace}
          open={missingFeeConfirmationHref != null}
        />

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
      <input name="paid_addons_json" type="hidden" value={paidAddonsJson} />
      <input name="fulfilment_method" type="hidden" value={editFulfilmentMethod} />
      <input name="delivery_json" type="hidden" value={deliveryJson} />

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
            id="guest_name"
            name="guest_name"
            onChange={(event) => setEditGuestName(event.target.value)}
            required
            value={editGuestName}
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
              id="guest_phone"
              name="guest_phone"
              onChange={(event) => setEditGuestPhone(event.target.value)}
              required={phoneRequired}
              type="tel"
              value={editGuestPhone}
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

      <div className="space-y-4">
        <OrderFulfilmentCreateFields
          customerName={editGuestName}
          customerPhone={editGuestPhone}
          defaultDate={order.pickupDate}
          defaultTime={order.pickupTime}
          delivery={editDeliveryDraft}
          method={editFulfilmentMethod}
          onDateChange={setEditPickupDate}
          onDeliveryChange={setEditDeliveryDraft}
          onMethodChange={setEditFulfilmentMethod}
          scheduleMode={sourceLocked ? "slots" : "owner"}
        />
        {pickupMonthChanging ? (
          <div className="border-status-warning/30 bg-status-warning-soft space-y-3 rounded-lg border px-4 py-3">
            <p className="text-status-warning text-sm">
              This changes the{" "}
              {editFulfilmentMethod === "delivery" ? "delivery" : "pickup"}{" "}
              month from {formatBusinessMonthYear(order.pickupDate)} to{" "}
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
                Owner override — allow{" "}
                {editFulfilmentMethod === "delivery" ? "delivery" : "pickup"}{" "}
                month change
              </span>
            </label>
          </div>
        ) : (
          <input name="pickup_month_override" type="hidden" value="0" />
        )}
        {deliveryToPickupWarning ? (
          <div className="border-status-warning/30 bg-status-warning-soft space-y-2 rounded-lg border px-4 py-3">
            <p className="text-status-warning text-sm">
              Changing this order to Pickup will remove its Delivery charges:
            </p>
            <ul className="text-status-warning list-inside list-disc text-sm">
              {deliveryToPickupWarning.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {deliveryToPickupWarning.removableAmount > 0 ? (
              <p className="text-status-warning text-sm">
                Amount due will decrease accordingly.
              </p>
            ) : null}
            {hasVerifiedPayment &&
            deliveryToPickupWarning.removableAmount > 0 ? (
              <p className="text-status-warning text-sm font-medium">
                This order already has payment recorded. Removing Delivery
                charges may create an overpayment.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

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
          Add-ons
        </h2>
        <OrderPaidAddonsEditor
          drafts={editPaidAddons}
          onChange={setEditPaidAddons}
          preferSnapshotPrice
        />
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
          {operationalSectionTitle(order.fulfilmentMethod)}
        </h2>
        <OrderOperationalControls
          compact
          fulfilmentMethod={order.fulfilmentMethod}
          deliveredAt={order.deliveredAt}
          orderId={order.id}
          outForDeliveryAt={order.outForDeliveryAt}
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
