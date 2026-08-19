"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FormActions,
  FormCheckbox,
  FormError,
  FormField,
  FormInput,
  FormRadioGroup,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import { OrderGuideCallout } from "@/components/ui/OrderGuideCallout";
import { PickupSlotFields } from "@/components/ui/PickupSlotFields";
import {
  ORDERS_CLOSED_CUSTOMER_LABEL,
  ORDERS_CLOSED_RPC_MESSAGE,
  isPickupOrdersClosed,
} from "@/engines/business-calendar/order-availability";
import { earliestPickupDateYmd } from "@/engines/business-calendar/pickup-slots";
import { formatShortBusinessDate } from "@/lib/dates";
import type { StorefrontCake } from "@/types/storefront";
import {
  formatCollectionAvailabilityLabel,
  formatRm,
  startingPrice,
} from "@/workspaces/storefront/catalog/pricing";
import {
  customerPaidAddonMessageRequired,
  customerPaidAddonMessageVisible,
  customerPreorderCommercialTotal,
  formatCustomerPreorderOptionLabel,
  type CustomerComplimentaryOption,
  type CustomerPaidAddonOption,
} from "@/engines/orders/customer-preorder-options";
import {
  loadCheckoutPickupOffer,
  submitGuestPreorderAction,
  type CheckoutState,
} from "@/workspaces/storefront/checkout/actions";
import {
  emptyPreorderFields,
  filterDraftItemsToOfferedCakes,
  readPreorderDraft,
  writePreorderDraft,
  type PreorderDraft,
  type PreorderDraftFields,
  type PreorderDraftItem,
} from "@/workspaces/storefront/checkout/preorder-draft";

const initialState: CheckoutState = { error: null };

type GuestCheckoutFormProps = {
  closedDates?: readonly string[];
  suggestedPickupDate?: string | null;
  maxPickupDate?: string | null;
};

function persistDraft(
  items: PreorderDraftItem[],
  fields: PreorderDraftFields,
): void {
  const draft: PreorderDraft = {
    ...fields,
    items,
  };
  writePreorderDraft(draft);
}

export function GuestCheckoutForm({
  closedDates = [],
  suggestedPickupDate = null,
  maxPickupDate = null,
}: GuestCheckoutFormProps) {
  const [state, formAction, pending] = useActionState(
    submitGuestPreorderAction,
    initialState,
  );

  const [items, setItems] = useState<PreorderDraftItem[]>([]);
  const [fields, setFields] = useState<PreorderDraftFields>(() =>
    emptyPreorderFields(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [cakes, setCakes] = useState<StorefrontCake[]>([]);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(
    null,
  );
  const [offerLabel, setOfferLabel] = useState<string | null>(null);
  const [complimentaryOptions, setComplimentaryOptions] = useState<
    CustomerComplimentaryOption[]
  >([]);
  const [paidAddonOptions, setPaidAddonOptions] = useState<
    CustomerPaidAddonOption[]
  >([]);
  const [optionsReady, setOptionsReady] = useState(false);
  const [loadingOffer, setLoadingOffer] = useState(false);
  const [addSizeByCake, setAddSizeByCake] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    const draft = readPreorderDraft();
    const suggested = suggestedPickupDate?.trim().slice(0, 10) ?? "";
    const max = maxPickupDate?.trim().slice(0, 10) ?? "";
    let pickupDate = /^\d{4}-\d{2}-\d{2}$/.test(suggested)
      ? suggested
      : (draft?.pickupDate ?? "");
    if (max && pickupDate > max) {
      pickupDate = "";
    }
    setItems(draft?.items ?? []);
    setFields({
      customerName: draft?.customerName ?? "",
      phone: draft?.phone ?? "",
      email: draft?.email ?? "",
      emailSubmissionReceiptRequested:
        draft?.emailSubmissionReceiptRequested ?? false,
      includeReceiptChoice: draft?.includeReceiptChoice ?? "",
      pickupDate,
      pickupTime: draft?.pickupTime ?? "",
      notes: draft?.notes ?? "",
      complimentaryCodes: draft?.complimentaryCodes ?? [],
      paidAddonCodes: draft?.paidAddonCodes ?? [],
      birthdayCardMessage: draft?.birthdayCardMessage ?? "",
      wishingCardMessage: draft?.wishingCardMessage ?? "",
      paidAddonUnitPriceByCode: draft?.paidAddonUnitPriceByCode ?? {},
    });
    setHydrated(true);
  }, [suggestedPickupDate, maxPickupDate]);

  useEffect(() => {
    if (!hydrated) return;
    persistDraft(items, fields);
  }, [items, fields, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const pickupDate = fields.pickupDate;
    if (!pickupDate) {
      setCakes([]);
      setUnavailableMessage(null);
      setOfferLabel(null);
      setComplimentaryOptions([]);
      setPaidAddonOptions([]);
      setOptionsReady(false);
      setLoadingOffer(false);
      return;
    }

    let cancelled = false;
    setLoadingOffer(true);
    void loadCheckoutPickupOffer(pickupDate).then((offer) => {
      if (cancelled) return;
      setCakes(offer.cakes);
      setUnavailableMessage(offer.unavailableMessage);
      setComplimentaryOptions(offer.complimentaryOptions);
      setPaidAddonOptions(offer.paidAddonOptions);
      setOptionsReady(offer.optionsReady);
      setOfferLabel(
        offer.collection
          ? formatCollectionAvailabilityLabel(offer.collection)
          : null,
      );
      setAddSizeByCake(
        Object.fromEntries(
          offer.cakes.map((cake) => [cake.id, cake.sizes[0]?.id ?? ""]),
        ),
      );
      setItems((current) => {
        const filtered = filterDraftItemsToOfferedCakes(current, offer.cakes);
        if (filtered.dropped) {
          setItemError(
            "Some cakes are not available for this pickup date and were removed.",
          );
        }
        return filtered.items;
      });
      setFields((current) => ({
        ...current,
        complimentaryCodes: current.complimentaryCodes.filter((code) =>
          offer.complimentaryOptions.some((option) => option.code === code),
        ),
        paidAddonCodes: current.paidAddonCodes.filter((code) =>
          offer.paidAddonOptions.some((option) => option.code === code),
        ),
        paidAddonUnitPriceByCode: Object.fromEntries(
          offer.paidAddonOptions.map((option) => [
            option.code,
            option.unitPrice,
          ]),
        ),
      }));
      setLoadingOffer(false);
    });

    return () => {
      cancelled = true;
    };
  }, [fields.pickupDate, hydrated]);

  const total = useMemo(
    () =>
      customerPreorderCommercialTotal({
        items,
        options: paidAddonOptions,
        selectedCodes: fields.paidAddonCodes,
      }),
    [items, paidAddonOptions, fields.paidAddonCodes],
  );
  const itemsJson = useMemo(
    () =>
      JSON.stringify(
        items.map((item) => ({
          cakeId: item.cakeId,
          sizeId: item.sizeId,
          quantity: item.quantity,
        })),
      ),
    [items],
  );
  const optionsJson = useMemo(
    () =>
      JSON.stringify({
        complimentaryCodes: fields.complimentaryCodes,
        paidAddonCodes: fields.paidAddonCodes,
        birthdayCardMessage: fields.birthdayCardMessage,
        wishingCardMessage: fields.wishingCardMessage,
      }),
    [
      fields.complimentaryCodes,
      fields.paidAddonCodes,
      fields.birthdayCardMessage,
      fields.wishingCardMessage,
    ],
  );

  function patchFields(patch: Partial<PreorderDraftFields>) {
    setFields((current) => ({ ...current, ...patch }));
  }

  function toggleComplimentary(code: string, selected: boolean) {
    const next = selected
      ? Array.from(new Set([...fields.complimentaryCodes, code]))
      : fields.complimentaryCodes.filter((entry) => entry !== code);
    patchFields({ complimentaryCodes: next });
  }

  function togglePaidAddon(code: string, selected: boolean) {
    const next = selected
      ? Array.from(new Set([...fields.paidAddonCodes, code]))
      : fields.paidAddonCodes.filter((entry) => entry !== code);
    patchFields({ paidAddonCodes: next });
  }

  function updateItem(index: number, patch: Partial<PreorderDraftItem>) {
    setItemError(null);
    setItems((current) => {
      const next = current.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      );
      const map = new Map<string, PreorderDraftItem>();
      for (const item of next) {
        const key = `${item.cakeId}::${item.sizeId}`;
        const existing = map.get(key);
        if (existing) {
          map.set(key, {
            ...existing,
            quantity: existing.quantity + item.quantity,
          });
        } else {
          map.set(key, item);
        }
      }
      return Array.from(map.values());
    });
  }

  function changeSize(index: number, sizeId: string) {
    const item = items[index];
    const cake = cakes.find((entry) => entry.id === item.cakeId);
    const size = cake?.sizes.find((entry) => entry.id === sizeId);
    if (!size) return;
    updateItem(index, {
      sizeId: size.id,
      sizeLabel: size.size,
      unitPrice: size.price,
    });
  }

  function removeItem(index: number) {
    setItemError(null);
    setItems((current) => current.filter((_, i) => index !== i));
  }

  function addOfferedCake(cake: StorefrontCake) {
    const sizeId = addSizeByCake[cake.id] || cake.sizes[0]?.id;
    const size = cake.sizes.find((entry) => entry.id === sizeId);
    if (!size) return;
    setItemError(null);
    setItems((current) => {
      const filtered = filterDraftItemsToOfferedCakes(
        [
          ...current,
          {
            cakeId: cake.id,
            sizeId: size.id,
            quantity: 1,
            cakeName: cake.name,
            sizeLabel: size.size,
            unitPrice: size.price,
          },
        ],
        cakes,
      );
      return filtered.items;
    });
  }

  function handleSubmit(formData: FormData) {
    if (unavailableMessage) {
      setItemError(unavailableMessage);
      return;
    }
    if (items.length === 0) {
      setItemError("Please add at least one cake to your preorder.");
      return;
    }
    const pickupDate = String(formData.get("pickup_date") ?? "").trim();
    if (isPickupOrdersClosed(pickupDate, closedDates)) {
      setItemError(ORDERS_CLOSED_RPC_MESSAGE);
      return;
    }
    setItemError(null);
    persistDraft(items, fields);
    formAction(formData);
  }

  const upcomingClosed = closedDates
    .filter((date) => date >= earliestPickupDateYmd())
    .slice(0, 8);
  const catalogueReady = Boolean(fields.pickupDate) && !unavailableMessage;

  if (!hydrated) {
    return (
      <p className="text-skyline text-sm" aria-live="polite">
        Preparing your preorder…
      </p>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-5">
      <input name="items_json" type="hidden" value={itemsJson} />
      <input name="preorder_options_json" type="hidden" value={optionsJson} />
      <input
        name="preorder_options_ready"
        type="hidden"
        value={optionsReady ? "1" : "0"}
      />

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Pickup
        </h2>
        <PickupSlotFields
          closedDates={closedDates}
          defaultDate={fields.pickupDate}
          defaultTime={fields.pickupTime}
          maxDate={maxPickupDate ?? undefined}
          onDateChange={(pickupDate) => patchFields({ pickupDate })}
          onTimeChange={(pickupTime) => patchFields({ pickupTime })}
        />
        <p className="text-skyline text-sm">
          Your available cakes depend on your pickup date.
        </p>
        {upcomingClosed.length > 0 ? (
          <p className="text-skyline text-sm">
            {upcomingClosed.length === 1
              ? `${formatShortBusinessDate(upcomingClosed[0] ?? "")} — ${ORDERS_CLOSED_CUSTOMER_LABEL}.`
              : `Pickup dates with ${ORDERS_CLOSED_CUSTOMER_LABEL.toLowerCase()}: ${upcomingClosed
                  .map((date) => formatShortBusinessDate(date))
                  .join(", ")}.`}
          </p>
        ) : null}
      </section>

      <section className="border-fog space-y-3 rounded-xl border bg-white px-4 py-4">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Your cakes
        </h2>
        {!fields.pickupDate ? (
          <p className="text-skyline text-sm">
            Choose a pickup date to see cakes available for that day.
          </p>
        ) : loadingOffer ? (
          <p className="text-skyline text-sm" aria-live="polite">
            Loading cakes for that pickup date…
          </p>
        ) : unavailableMessage ? (
          <div role="status">
            <p className="text-ink text-sm font-medium leading-relaxed">
              {unavailableMessage}
            </p>
            <p className="text-skyline mt-2 text-sm leading-relaxed">
              Please choose a pickup date in a published catalogue.
            </p>
          </div>
        ) : (
          <>
            {offerLabel ? (
              <p className="text-skyline text-sm">{offerLabel}</p>
            ) : null}
            {items.length === 0 ? (
              <p className="text-skyline text-sm">No cakes added yet.</p>
            ) : (
              <ul className="space-y-3">
                {items.map((item, index) => {
                  const cake = cakes.find((entry) => entry.id === item.cakeId);
                  return (
                    <li
                      className="border-fog space-y-2 rounded-lg border px-3 py-3"
                      key={`${item.cakeId}-${item.sizeId}-${index}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-ink font-medium">{item.cakeName}</p>
                          <p className="text-skyline mt-0.5 text-sm">
                            {item.sizeLabel} × {item.quantity} ·{" "}
                            {formatRm(item.unitPrice * item.quantity)}
                          </p>
                        </div>
                        <button
                          className="text-skyline hover:text-ink text-xs font-medium"
                          onClick={() => removeItem(index)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <FormField htmlFor={`size-${index}`} label="Size">
                          <FormSelect
                            id={`size-${index}`}
                            onChange={(event) =>
                              changeSize(index, event.target.value)
                            }
                            value={item.sizeId}
                          >
                            {(cake?.sizes ?? []).map((size) => (
                              <option key={size.id} value={size.id}>
                                {size.size} — {formatRm(size.price)}
                              </option>
                            ))}
                          </FormSelect>
                        </FormField>
                        <FormField htmlFor={`qty-${index}`} label="Quantity">
                          <FormInput
                            id={`qty-${index}`}
                            min={1}
                            onChange={(event) =>
                              updateItem(index, {
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
                    </li>
                  );
                })}
              </ul>
            )}

            {cakes.length > 0 ? (
              <div className="border-fog space-y-2 border-t pt-3">
                <p className="text-ink text-sm font-medium">
                  Add a cake for this pickup date
                </p>
                <ul className="space-y-2">
                  {cakes.map((cake) => (
                    <li
                      className="flex flex-wrap items-center gap-2"
                      key={cake.id}
                    >
                      <span className="text-ink min-w-0 flex-1 text-sm">
                        {cake.name}
                        {startingPrice(cake) != null
                          ? ` · from ${formatRm(startingPrice(cake) ?? 0)}`
                          : ""}
                      </span>
                      <FormSelect
                        aria-label={`Size for ${cake.name}`}
                        className="w-36"
                        onChange={(event) =>
                          setAddSizeByCake((current) => ({
                            ...current,
                            [cake.id]: event.target.value,
                          }))
                        }
                        value={addSizeByCake[cake.id] ?? cake.sizes[0]?.id ?? ""}
                      >
                        {cake.sizes.map((size) => (
                          <option key={size.id} value={size.id}>
                            {size.size}
                          </option>
                        ))}
                      </FormSelect>
                      <button
                        className="text-signal text-sm font-medium"
                        onClick={() => addOfferedCake(cake)}
                        type="button"
                      >
                        Add
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-skyline text-sm">
                No cakes are offered for this pickup date.
              </p>
            )}
          </>
        )}

        {!unavailableMessage && fields.pickupDate ? (
          <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
            <p className="text-ink text-sm font-semibold">
              Total · {formatRm(total)}
            </p>
          </div>
        ) : null}
        {itemError ? (
          <p className="text-status-danger text-sm" role="alert">
            {itemError}
          </p>
        ) : null}
      </section>

      {optionsReady &&
      (complimentaryOptions.length > 0 || paidAddonOptions.length > 0) ? (
        <section className="space-y-4">
          <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
            Options
          </h2>
          {complimentaryOptions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-ink text-sm font-medium">Complimentary</p>
              {complimentaryOptions.map((option) => (
                <FormCheckbox
                  checked={fields.complimentaryCodes.includes(option.code)}
                  key={option.code}
                  label={formatCustomerPreorderOptionLabel(option.name, 0)}
                  onChange={(event) =>
                    toggleComplimentary(option.code, event.target.checked)
                  }
                />
              ))}
            </div>
          ) : null}
          {paidAddonOptions.length > 0 ? (
            <div className="space-y-3">
              <p className="text-ink text-sm font-medium">Paid</p>
              {paidAddonOptions.map((option) => {
                const selected = fields.paidAddonCodes.includes(option.code);
                const messageVisible =
                  option.code === "birthday_card" ||
                  option.code === "wishing_card"
                    ? customerPaidAddonMessageVisible(
                        option.code,
                        fields.paidAddonCodes,
                      )
                    : false;
                const messageRequired =
                  option.code === "birthday_card" ||
                  option.code === "wishing_card"
                    ? customerPaidAddonMessageRequired(
                        option.code,
                        fields.paidAddonCodes,
                      )
                    : false;
                const messageValue =
                  option.code === "birthday_card"
                    ? fields.birthdayCardMessage
                    : option.code === "wishing_card"
                      ? fields.wishingCardMessage
                      : "";
                return (
                  <div className="space-y-2" key={option.code}>
                    <FormCheckbox
                      checked={selected}
                      label={formatCustomerPreorderOptionLabel(
                        option.name,
                        option.unitPrice,
                      )}
                      onChange={(event) =>
                        togglePaidAddon(option.code, event.target.checked)
                      }
                    />
                    {messageVisible ? (
                      <FormField
                        help="Optional."
                        htmlFor={`${option.code}_message`}
                        label={`Written message on ${option.name}`}
                      >
                        <FormTextarea
                          id={`${option.code}_message`}
                          onChange={(event) =>
                            patchFields(
                              option.code === "birthday_card"
                                ? {
                                    birthdayCardMessage: event.target.value,
                                  }
                                : {
                                    wishingCardMessage: event.target.value,
                                  },
                            )
                          }
                          required={messageRequired}
                          rows={3}
                          value={messageValue}
                        />
                      </FormField>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      <OrderGuideCallout />

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Customer
        </h2>
        <FormField htmlFor="customer_name" label="Name">
          <FormInput
            id="customer_name"
            name="customer_name"
            onChange={(event) =>
              patchFields({ customerName: event.target.value })
            }
            required
            value={fields.customerName}
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            help="Primary contact for WhatsApp updates"
            htmlFor="phone"
            label="WhatsApp phone"
          >
            <FormInput
              id="phone"
              name="phone"
              onChange={(event) => patchFields({ phone: event.target.value })}
              required
              type="tel"
              value={fields.phone}
            />
          </FormField>
          <FormField
            help="For a copy of your preorder submission"
            htmlFor="email"
            label="Email (optional)"
          >
            <FormInput
              id="email"
              name="email"
              onChange={(event) => patchFields({ email: event.target.value })}
              required={fields.emailSubmissionReceiptRequested}
              type="email"
              value={fields.email}
            />
          </FormField>
        </div>
        <FormCheckbox
          checked={fields.emailSubmissionReceiptRequested}
          label="Email me a copy of my preorder submission"
          name="email_submission_receipt_requested"
          onChange={(event) =>
            patchFields({
              emailSubmissionReceiptRequested: event.target.checked,
            })
          }
        />
        <FormRadioGroup
          legend="Would you like a copy of the receipt? (will be attached during pickup)"
          name="include_receipt"
          onChange={(value) =>
            patchFields({
              includeReceiptChoice: value === "yes" || value === "no" ? value : "",
            })
          }
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          required
          value={fields.includeReceiptChoice}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
          Notes
        </h2>
        <FormField htmlFor="notes" label="Optional notes">
          <FormTextarea
            id="notes"
            name="notes"
            onChange={(event) => patchFields({ notes: event.target.value })}
            rows={3}
            value={fields.notes}
          />
        </FormField>
      </section>

      <FormError message={state.error} />

      <FormActions>
        <FormSubmitButton
          disabled={!catalogueReady || Boolean(unavailableMessage)}
          pending={pending}
        >
          Submit Preorder
        </FormSubmitButton>
        <Link
          className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
          href="/order"
        >
          Back
        </Link>
      </FormActions>
    </form>
  );
}
