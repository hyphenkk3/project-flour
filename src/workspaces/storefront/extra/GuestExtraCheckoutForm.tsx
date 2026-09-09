"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FormActions,
  FormCheckbox,
  FormError,
  FormField,
  FormInput,
  FormRadioGroup,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import {
  FRESH_PICKS_NAME_HELP,
  FRESH_PICKS_SUCCESS_FLOW,
  FRESH_PICKS_WHATSAPP_NOTE,
} from "@/engines/extra/customer-fresh-picks";
import { OPTIONAL_NOTES_CUSTOMER_WARNING } from "@/engines/orders/order-guide";
import {
  customerPaidAddonMessageRequired,
  customerPaidAddonMessageVisible,
  customerPreorderCommercialTotal,
  formatCustomerPreorderOptionLabel,
  isCustomerPaidAddonCode,
  type CustomerComplimentaryOption,
  type CustomerPaidAddonOption,
} from "@/engines/orders/customer-preorder-options";
import { formatShortBusinessDate } from "@/lib/dates";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  buildExtraCheckoutConfirmSnapshot,
  CheckoutConfirmPrompt,
  type CheckoutConfirmSnapshot,
} from "@/workspaces/storefront/checkout/CheckoutConfirmPrompt";
import type { PhysicalReceiptChoice } from "@/workspaces/storefront/checkout/preorder-draft";
import {
  loadExtraCustomerOptions,
  submitGuestExtraOrderAction,
  type ExtraOrderState,
} from "@/workspaces/storefront/extra/actions";
import {
  patchFreshPickCart,
  readFreshPickCart,
  writeFreshPickCart,
} from "@/workspaces/storefront/extra/fresh-pick-cart";
import { useFreshPickCart } from "@/workspaces/storefront/extra/useFreshPickCart";

const initialState: ExtraOrderState = { error: null };

export function GuestExtraCheckoutForm() {
  const cart = useFreshPickCart();
  const [state, formAction, pending] = useActionState(
    submitGuestExtraOrderAction,
    initialState,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSnapshot, setConfirmSnapshot] =
    useState<CheckoutConfirmSnapshot | null>(null);
  const pendingSubmitRef = useRef<FormData | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [includeReceiptChoice, setIncludeReceiptChoice] =
    useState<PhysicalReceiptChoice>("");
  const [complimentaryOptions, setComplimentaryOptions] = useState<
    CustomerComplimentaryOption[]
  >([]);
  const [paidAddonOptions, setPaidAddonOptions] = useState<
    CustomerPaidAddonOption[]
  >([]);
  const [complimentaryCodes, setComplimentaryCodes] = useState<string[]>([]);
  const [paidAddonCodes, setPaidAddonCodes] = useState<string[]>([]);
  const [birthdayCardMessage, setBirthdayCardMessage] = useState("");
  const [wishingCardMessage, setWishingCardMessage] = useState("");

  const pickupDate = cart?.pickupDate ?? "";
  const pickupTime = cart?.pickupTime ?? "";

  useEffect(() => {
    if (!cart) return;
    setIncludeReceiptChoice(cart.includeReceiptChoice);
    setComplimentaryCodes(cart.complimentaryCodes);
    setPaidAddonCodes(cart.paidAddonCodes);
    setBirthdayCardMessage(cart.birthdayCardMessage);
    setWishingCardMessage(cart.wishingCardMessage);
  }, [cart]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!pickupDate) {
        setComplimentaryOptions([]);
        setPaidAddonOptions([]);
        return;
      }
      const next = await loadExtraCustomerOptions(pickupDate);
      if (cancelled) return;
      setComplimentaryOptions(next.complimentaryOptions);
      setPaidAddonOptions(next.paidAddonOptions);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [pickupDate]);

  useEffect(() => {
    if (!state.orderId) return;
    window.location.assign(
      `/order/success?order=${state.orderId}&flow=${FRESH_PICKS_SUCCESS_FLOW}`,
    );
  }, [state.orderId]);

  const displayedTotal = customerPreorderCommercialTotal({
    items: (cart?.items ?? []).map((item) => ({
      unitPrice: item.unitPrice ?? 0,
      quantity: 1,
    })),
    options: paidAddonOptions,
    selectedCodes: paidAddonCodes,
  });

  function persistCheckoutFields(form: HTMLFormElement) {
    const current = readFreshPickCart();
    if (!current) return;
    const data = new FormData(form);
    writeFreshPickCart(
      patchFreshPickCart(current, {
        customerName: String(data.get("customer_name") ?? current.customerName),
        phone: String(data.get("phone") ?? current.phone),
        includeReceiptChoice,
        notes: String(data.get("notes") ?? current.notes),
        complimentaryCodes,
        paidAddonCodes,
        birthdayCardMessage,
        wishingCardMessage,
      }),
    );
  }

  function openConfirm() {
    const form = formRef.current;
    if (!form || !cart || cart.items.length === 0) return;
    if (!form.reportValidity()) return;
    persistCheckoutFields(form);
    const data = new FormData(form);
    pendingSubmitRef.current = data;
    setConfirmSnapshot(
      buildExtraCheckoutConfirmSnapshot({
        items: cart.items,
        cakeName: cart.items[0]?.cakeName ?? "",
        sizeLabel: cart.items[0]?.sizeLabel ?? "",
        unitPrice: cart.items[0]?.unitPrice ?? null,
        pickupDate: cart.pickupDate,
        pickupTime: cart.pickupTime,
        customerName: String(data.get("customer_name") ?? ""),
        customerPhone: String(data.get("phone") ?? ""),
        notes: String(data.get("notes") ?? ""),
        paidAddonOptions,
        paidAddonCodes,
        complimentaryOptions,
        complimentaryCodes,
        total: displayedTotal,
      }),
    );
    setConfirmOpen(true);
  }

  function confirmOrder() {
    if (pending || state.orderId) return;
    const formData = pendingSubmitRef.current;
    if (!formData) return;
    formAction(formData);
  }

  function goBackFromConfirm() {
    if (pending || state.orderId) return;
    setConfirmOpen(false);
  }

  function toggleComplimentary(code: string, checked: boolean) {
    setComplimentaryCodes((current) =>
      checked ? [...current, code] : current.filter((value) => value !== code),
    );
  }

  function togglePaidAddon(code: string, checked: boolean) {
    setPaidAddonCodes((current) =>
      checked ? [...current, code] : current.filter((value) => value !== code),
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="border-fog mt-8 border-t pt-8">
        <p className="text-ink text-sm">Your Fresh Pick order is empty.</p>
        <p className="mt-6">
          <Link className="text-signal text-sm font-medium" href="/extra">
            View Fresh Picks
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          openConfirm();
        }}
        ref={formRef}
      >
        {cart.items.map((item) => (
          <span key={item.extraStockId}>
            <input name="extra_stock_id" type="hidden" value={item.extraStockId} />
            <input name="extra_cake_name" type="hidden" value={item.cakeName} />
          </span>
        ))}
        <input name="pickup_date" type="hidden" value={cart.pickupDate} />
        <input name="pickup_time" type="hidden" value={cart.pickupTime} />

        <section className="space-y-3">
          <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
            Your order
          </h2>
          <ul className="divide-fog divide-y">
            {cart.items.map((item) => (
              <li className="flex items-start justify-between gap-3 py-3" key={item.extraStockId}>
                <div>
                  <p className="text-ink text-sm font-medium">{item.cakeName}</p>
                  <p className="text-skyline text-sm">{item.sizeLabel}</p>
                </div>
                <p className="text-ink text-sm tabular-nums">
                  {item.unitPrice != null ? formatRm(item.unitPrice) : "—"}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-skyline text-sm">
            Pickup · {formatShortBusinessDate(pickupDate) || pickupDate} ·{" "}
            {formatPickupTime(pickupTime)}
          </p>
          <p className="text-ink text-sm font-semibold">
            Total · {formatRm(displayedTotal)}
          </p>
        </section>

        {complimentaryOptions.length > 0 || paidAddonOptions.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
              Options
            </h2>
            {complimentaryOptions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-ink text-sm font-medium">Complimentary</p>
                {complimentaryOptions.map((option) => (
                  <FormCheckbox
                    checked={complimentaryCodes.includes(option.code)}
                    key={option.code}
                    label={formatCustomerPreorderOptionLabel(option.name, 0)}
                    name="complimentary_code"
                    onChange={(event) =>
                      toggleComplimentary(option.code, event.target.checked)
                    }
                    value={option.code}
                  />
                ))}
              </div>
            ) : null}
            {paidAddonOptions.length > 0 ? (
              <div className="space-y-3">
                <p className="text-ink text-sm font-medium">Paid</p>
                {paidAddonOptions.map((option) => {
                  const messageVisible =
                    isCustomerPaidAddonCode(option.code) &&
                    customerPaidAddonMessageVisible(option.code, paidAddonCodes);
                  const messageRequired =
                    isCustomerPaidAddonCode(option.code) &&
                    customerPaidAddonMessageRequired(option.code, paidAddonCodes);
                  const messageValue =
                    option.code === "birthday_card"
                      ? birthdayCardMessage
                      : option.code === "wishing_card"
                        ? wishingCardMessage
                        : "";
                  return (
                    <div className="space-y-2" key={option.code}>
                      <FormCheckbox
                        checked={paidAddonCodes.includes(option.code)}
                        label={formatCustomerPreorderOptionLabel(
                          option.name,
                          option.unitPrice,
                        )}
                        name="paid_addon_code"
                        onChange={(event) =>
                          togglePaidAddon(option.code, event.target.checked)
                        }
                        value={option.code}
                      />
                      {messageVisible ? (
                        <FormField
                          help="Optional."
                          htmlFor={`${option.code}_message`}
                          label={`Written message on ${option.name}`}
                        >
                          <FormTextarea
                            id={`${option.code}_message`}
                            name={`${option.code}_message`}
                            onChange={(event) => {
                              if (option.code === "birthday_card") {
                                setBirthdayCardMessage(event.target.value);
                              } else if (option.code === "wishing_card") {
                                setWishingCardMessage(event.target.value);
                              }
                            }}
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

        <section className="space-y-3">
          <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
            Customer
          </h2>
          <FormField
            help={FRESH_PICKS_NAME_HELP}
            htmlFor="customer_name"
            label="Name"
          >
            <FormInput
              defaultValue={cart.customerName}
              id="customer_name"
              name="customer_name"
              required
            />
          </FormField>
          <FormField
            help={FRESH_PICKS_WHATSAPP_NOTE}
            htmlFor="phone"
            label="WhatsApp phone"
          >
            <FormInput
              defaultValue={cart.phone}
              id="phone"
              name="phone"
              required
              type="tel"
            />
          </FormField>
          <FormRadioGroup
            legend="Would you like a copy of the receipt? (will be attached during pickup)"
            name="include_receipt"
            onChange={(value) =>
              setIncludeReceiptChoice(
                value === "yes" || value === "no" ? value : "",
              )
            }
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            required
            value={includeReceiptChoice}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-ink text-xs font-semibold tracking-[0.14em] uppercase">
            Notes
          </h2>
          <p className="text-ink text-sm font-medium">Optional notes</p>
          <p
            className="text-status-danger text-sm leading-snug font-bold"
            id="optional-notes-warning"
          >
            {OPTIONAL_NOTES_CUSTOMER_WARNING}
          </p>
          <FormTextarea
            aria-describedby="optional-notes-warning"
            aria-label="Optional notes"
            defaultValue={cart.notes}
            id="notes"
            name="notes"
            rows={3}
          />
        </section>

        <FormError message={state.error} />

        <FormActions>
          <FormSubmitButton
            disabled={confirmOpen}
            pending={pending || Boolean(state.orderId)}
          >
            Place order
          </FormSubmitButton>
          <Link
            className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border px-5 text-sm font-medium"
            href="/extra"
          >
            Continue shopping
          </Link>
        </FormActions>
      </form>
      {confirmSnapshot ? (
        <CheckoutConfirmPrompt
          onConfirm={confirmOrder}
          onGoBack={goBackFromConfirm}
          open={confirmOpen}
          pending={pending || Boolean(state.orderId)}
          snapshot={confirmSnapshot}
        />
      ) : null}
    </>
  );
}
