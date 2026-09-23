"use client";

import { useActionState, useMemo, useState } from "react";
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
import { PickupSlotFields } from "@/components/ui/PickupSlotFields";
import { DineInVenuePartyFields } from "@/components/ui/DineInVenuePartyFields";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  cakeServingSlotsForReservation,
  resolveDineInVenueForPair,
  venuesForReservationAndServing,
} from "@/engines/business-calendar/dine-in-hours";
import {
  CUSTOMER_NAME_HELP,
  CUSTOMER_NAME_SPACE_HINT,
} from "@/engines/orders/customer-name";
import {
  customerFulfilmentHoursNotice,
  customerFulfilmentSlotsForDate,
  DINE_IN_RESERVATION_INCLUDED_NOTICE,
  firstAvailableCustomerFulfilment,
} from "@/engines/orders/customer-fulfilment-availability";
import {
  OWNER_DELIVERY_CITY,
  OWNER_DELIVERY_STATE,
  RECIPIENT_NOTIFY_OPTIONS,
  parseCustomerWebsiteFulfilmentMethod,
  workspaceScheduleDateLabel,
  workspaceScheduleTimeLabel,
  type CustomerWebsiteFulfilmentMethod,
} from "@/engines/orders/fulfilment";
import { OPTIONAL_NOTES_CUSTOMER_WARNING } from "@/engines/orders/order-guide";
import {
  customerPaidAddonMessageRequired,
  customerPaidAddonMessageVisible,
  customerPreorderCommercialTotal,
  emptyCustomerPreorderSelections,
  formatCustomerPreorderOptionLabel,
  type CustomerComplimentaryOption,
  type CustomerPaidAddonOption,
} from "@/engines/orders/customer-preorder-options";
import {
  WAITING_LIST_CONFIRMATION_CLOSED_DATES,
  WAITING_LIST_CONFIRMATION_DATE_LOCKED_HELP,
  WAITING_LIST_CONFIRMATION_DEADLINE_HELP,
  WAITING_LIST_CONFIRMATION_SUCCESS_BODY,
  WAITING_LIST_CONFIRMATION_SUCCESS_TITLE,
  WAITING_LIST_CONFIRMATION_TITLE,
  waitingListConfirmationDeadlineSentence,
  type WaitingListConfirmationDisplayItem,
} from "@/engines/waiting-list/confirmation-page";
import { WAITING_LIST_WHATSAPP_NOTE } from "@/engines/waiting-list/phone";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import { CheckoutSection } from "@/workspaces/storefront/checkout/CheckoutSection";
import { DineInReservationNotesNotice } from "@/workspaces/storefront/checkout/DineInReservationNotesNotice";
import { FulfilmentMethodChooser } from "@/workspaces/storefront/checkout/FulfilmentMethodChooser";
import {
  submitWaitingListConfirmationAction,
  type WaitingListConfirmationState,
} from "@/workspaces/storefront/waiting-list/confirmation-actions";
import { formatShortBusinessDate } from "@/lib/dates";

type WaitingListConfirmationFormProps = {
  token: string;
  expiresAt: string;
  guestName: string;
  guestPhone: string;
  pickupDate: string;
  items: WaitingListConfirmationDisplayItem[];
  hoursSnapshot: OperatingHoursSnapshot;
  complimentaryOptions: CustomerComplimentaryOption[];
  paidAddonOptions: CustomerPaidAddonOption[];
  optionsReady: boolean;
};

const INITIAL: WaitingListConfirmationState = { error: null };

export function WaitingListConfirmationForm({
  token,
  expiresAt,
  guestName,
  guestPhone,
  pickupDate,
  items,
  hoursSnapshot,
  complimentaryOptions,
  paidAddonOptions,
  optionsReady,
}: WaitingListConfirmationFormProps) {
  const [state, action, pending] = useActionState(
    submitWaitingListConfirmationAction,
    INITIAL,
  );
  const [customerName, setCustomerName] = useState(guestName);
  const [phone, setPhone] = useState(guestPhone);
  const [includeReceipt, setIncludeReceipt] = useState("");
  const [notes, setNotes] = useState("");
  const [fulfilmentMethod, setFulfilmentMethod] =
    useState<CustomerWebsiteFulfilmentMethod>(() =>
      firstAvailableCustomerFulfilment(
        pickupDate,
        WAITING_LIST_CONFIRMATION_CLOSED_DATES,
        "pickup",
        hoursSnapshot,
      ),
    );
  const [pickupTime, setPickupTime] = useState("");
  const [reservationTime, setReservationTime] = useState("");
  const [dineInVenue, setDineInVenue] = useState("");
  const [adultCount, setAdultCount] = useState("");
  const [kidCount, setKidCount] = useState("");
  const [toddlerCount, setToddlerCount] = useState("");
  const [
    whitebirdSplitSeatingAcknowledged,
    setWhitebirdSplitSeatingAcknowledged,
  ] = useState(false);
  const [reservationNote, setReservationNote] = useState("");
  const [sameAsCustomer, setSameAsCustomer] = useState(true);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState(OWNER_DELIVERY_CITY);
  const [stateCode, setStateCode] = useState(OWNER_DELIVERY_STATE);
  const [recipientNotify, setRecipientNotify] = useState("");
  const [selections, setSelections] = useState(emptyCustomerPreorderSelections);

  const total = useMemo(
    () =>
      customerPreorderCommercialTotal({
        items,
        options: paidAddonOptions,
        selectedCodes: selections.paidAddonCodes,
      }),
    [items, paidAddonOptions, selections.paidAddonCodes],
  );

  if (state.submitted) {
    return (
      <div className="text-center">
        <h1 className="font-display text-ink text-3xl tracking-tight">
          {WAITING_LIST_CONFIRMATION_SUCCESS_TITLE}
        </h1>
        <p className="text-skyline mt-4 text-base leading-relaxed">
          {WAITING_LIST_CONFIRMATION_SUCCESS_BODY}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-10">
      <input name="token" type="hidden" value={token} />
      <input name="requested_date" type="hidden" value={pickupDate} />
      <input name="pickup_date" type="hidden" value={pickupDate} />
      <input name="fulfilment_method" type="hidden" value={fulfilmentMethod} />
      <input
        name="preorder_options_ready"
        type="hidden"
        value={optionsReady ? "1" : "0"}
      />
      <input
        name="preorder_options_json"
        type="hidden"
        value={JSON.stringify(selections)}
      />

      <header className="space-y-3">
        <h1 className="font-display text-ink text-3xl tracking-tight">
          {WAITING_LIST_CONFIRMATION_TITLE}
        </h1>
        <p className="text-ink text-base leading-relaxed">
          {waitingListConfirmationDeadlineSentence(expiresAt)}
        </p>
        <p className="text-skyline text-sm leading-relaxed">
          {WAITING_LIST_CONFIRMATION_DEADLINE_HELP}
        </p>
      </header>

      <CheckoutSection title="Your Waiting List request">
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              className="text-ink text-sm"
              key={`${item.cakeName}-${item.sizeLabel}`}
            >
              <span className="font-medium">{item.cakeName}</span>
              <span className="text-skyline">
                {" "}
                {item.sizeLabel} × {item.quantity}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-ink text-sm">
          Collection date · {formatShortBusinessDate(pickupDate)}
        </p>
        <p className="text-skyline text-sm leading-relaxed">
          {WAITING_LIST_CONFIRMATION_DATE_LOCKED_HELP}
        </p>
        <p className="text-ink text-sm font-medium">Total {formatRm(total)}</p>
      </CheckoutSection>

      <CheckoutSection
        className="border-fog border-t pt-10"
        description={customerFulfilmentHoursNotice(hoursSnapshot)}
        title="Fulfilment"
      >
        <FulfilmentMethodChooser
          closedDates={WAITING_LIST_CONFIRMATION_CLOSED_DATES}
          dateYmd={pickupDate}
          hoursSnapshot={hoursSnapshot}
          onChange={(value) => {
            setFulfilmentMethod(parseCustomerWebsiteFulfilmentMethod(value));
            setPickupTime("");
            setReservationTime("");
            setDineInVenue("");
          }}
          value={fulfilmentMethod}
        />
        {fulfilmentMethod === "dine_in" ? (
          <>
            <p className="text-ink text-sm leading-relaxed">
              {DINE_IN_RESERVATION_INCLUDED_NOTICE}
            </p>
            <PickupSlotFields
              closedDates={WAITING_LIST_CONFIRMATION_CLOSED_DATES}
              dateLabel="Dine-in date"
              defaultDate={pickupDate}
              defaultTime={reservationTime}
              hoursSnapshot={hoursSnapshot}
              includeFieldNames={false}
              maxDate={pickupDate}
              minDate={pickupDate}
              onDateChange={() => undefined}
              onTimeChange={(next) => {
                const servingOptions = cakeServingSlotsForReservation(
                  pickupDate,
                  next,
                  hoursSnapshot,
                );
                const nextServing = servingOptions.some(
                  (slot) => slot.value === pickupTime,
                )
                  ? pickupTime
                  : "";
                setReservationTime(next);
                setPickupTime(nextServing);
                setDineInVenue(
                  nextServing
                    ? resolveDineInVenueForPair(
                        pickupDate,
                        next,
                        nextServing,
                        dineInVenue,
                        hoursSnapshot,
                      )
                    : "",
                );
              }}
              slotsForDate={(date, closed) =>
                customerFulfilmentSlotsForDate(
                  "dine_in",
                  date,
                  closed,
                  hoursSnapshot,
                )
              }
              timeHelp="Choose when you would like your table reservation to start."
              timeId="reservation_time"
              timeLabel="Dine-in reservation time"
              timeName="reservation_time"
            />
            <input
              name="reservation_time"
              type="hidden"
              value={reservationTime}
            />
            {reservationTime ? (
              <PickupSlotFields
                closedDates={WAITING_LIST_CONFIRMATION_CLOSED_DATES}
                defaultDate={pickupDate}
                defaultTime={pickupTime}
                hoursSnapshot={hoursSnapshot}
                maxDate={pickupDate}
                minDate={pickupDate}
                onTimeChange={(next) => {
                  setPickupTime(next);
                  setDineInVenue(
                    resolveDineInVenueForPair(
                      pickupDate,
                      reservationTime,
                      next,
                      dineInVenue,
                      hoursSnapshot,
                    ),
                  );
                }}
                showDate={false}
                slotsForDate={(date) =>
                  cakeServingSlotsForReservation(
                    date,
                    reservationTime,
                    hoursSnapshot,
                  )
                }
                timeHelp="Choose when you would like your cake served. Cake serving time must be within 1 hour of your reservation time."
                timeLabel="Cake serving time"
              />
            ) : null}
            {pickupDate && reservationTime && pickupTime ? (
              <DineInVenuePartyFields
                onChange={(next) => {
                  setDineInVenue(next.venue);
                  setAdultCount(next.adultCount);
                  setKidCount(next.kidCount);
                  setToddlerCount(next.toddlerCount);
                  setWhitebirdSplitSeatingAcknowledged(
                    next.whitebirdSplitSeatingAcknowledged,
                  );
                }}
                value={{
                  venue: dineInVenue,
                  adultCount,
                  kidCount,
                  toddlerCount,
                  whitebirdSplitSeatingAcknowledged,
                }}
                venues={venuesForReservationAndServing(
                  pickupDate,
                  reservationTime,
                  pickupTime,
                  hoursSnapshot,
                )}
              />
            ) : null}
            <DineInReservationNotesNotice />
            <FormField
              help="Optional."
              htmlFor="reservation_note"
              label="Reservation note"
            >
              <FormTextarea
                id="reservation_note"
                name="reservation_note"
                onChange={(event) => setReservationNote(event.target.value)}
                rows={3}
                value={reservationNote}
              />
            </FormField>
          </>
        ) : (
          <PickupSlotFields
            closedDates={WAITING_LIST_CONFIRMATION_CLOSED_DATES}
            dateLabel={workspaceScheduleDateLabel(fulfilmentMethod)}
            defaultDate={pickupDate}
            defaultTime={pickupTime}
            hoursSnapshot={hoursSnapshot}
            maxDate={pickupDate}
            minDate={pickupDate}
            onDateChange={() => undefined}
            onTimeChange={setPickupTime}
            slotsForDate={(date, closed) =>
              customerFulfilmentSlotsForDate(
                fulfilmentMethod,
                date,
                closed,
                hoursSnapshot,
              )
            }
            timeLabel={workspaceScheduleTimeLabel(fulfilmentMethod)}
          />
        )}
        {fulfilmentMethod === "delivery" ? (
          <div className="space-y-3">
            <FormCheckbox
              checked={sameAsCustomer}
              label="Recipient is the same as the ordering customer"
              name="same_as_customer"
              onChange={(event) => {
                const next = event.target.checked;
                setSameAsCustomer(next);
                if (next) {
                  setRecipientName("");
                  setRecipientPhone("");
                  setRecipientNotify("");
                }
              }}
            />
            {!sameAsCustomer ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField htmlFor="recipient_name" label="Recipient name">
                  <FormInput
                    id="recipient_name"
                    name="recipient_name"
                    onChange={(event) => setRecipientName(event.target.value)}
                    required
                    value={recipientName}
                  />
                </FormField>
                <FormField htmlFor="recipient_phone" label="Recipient phone">
                  <FormInput
                    id="recipient_phone"
                    name="recipient_phone"
                    onChange={(event) => setRecipientPhone(event.target.value)}
                    required
                    type="tel"
                    value={recipientPhone}
                  />
                </FormField>
              </div>
            ) : null}
            <FormField htmlFor="address_line_1" label="Address line 1">
              <FormInput
                id="address_line_1"
                name="address_line_1"
                onChange={(event) => setAddressLine1(event.target.value)}
                required
                value={addressLine1}
              />
            </FormField>
            <FormField htmlFor="address_line_2" label="Address line 2">
              <FormInput
                id="address_line_2"
                name="address_line_2"
                onChange={(event) => setAddressLine2(event.target.value)}
                value={addressLine2}
              />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField htmlFor="postcode" label="Postcode">
                <FormInput
                  id="postcode"
                  name="postcode"
                  onChange={(event) => setPostcode(event.target.value)}
                  required
                  value={postcode}
                />
              </FormField>
              <FormField htmlFor="city" label="City">
                <FormInput
                  id="city"
                  name="city"
                  onChange={(event) => setCity(event.target.value)}
                  required
                  value={city}
                />
              </FormField>
              <FormField htmlFor="state" label="State">
                <FormInput
                  id="state"
                  name="state"
                  onChange={(event) => setStateCode(event.target.value)}
                  required
                  value={stateCode}
                />
              </FormField>
            </div>
            {!sameAsCustomer ? (
              <FormRadioGroup
                legend="Should we inform the recipient?"
                name="recipient_notify_preference"
                onChange={setRecipientNotify}
                options={[...RECIPIENT_NOTIFY_OPTIONS]}
                required
                value={recipientNotify}
              />
            ) : null}
          </div>
        ) : null}
      </CheckoutSection>

      {optionsReady &&
      (complimentaryOptions.length > 0 || paidAddonOptions.length > 0) ? (
        <CheckoutSection className="border-fog border-t pt-10" title="Options">
          {complimentaryOptions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-ink text-sm font-medium">Complimentary</p>
              {complimentaryOptions.map((option) => (
                <FormCheckbox
                  checked={selections.complimentaryCodes.includes(option.code)}
                  key={option.code}
                  label={formatCustomerPreorderOptionLabel(option.name, 0)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSelections((current) => ({
                      ...current,
                      complimentaryCodes: checked
                        ? [...current.complimentaryCodes, option.code]
                        : current.complimentaryCodes.filter(
                            (code) => code !== option.code,
                          ),
                    }));
                  }}
                />
              ))}
            </div>
          ) : null}
          {paidAddonOptions.length > 0 ? (
            <div className="space-y-3">
              <p className="text-ink text-sm font-medium">Paid</p>
              {paidAddonOptions.map((option) => {
                const selected = selections.paidAddonCodes.includes(
                  option.code,
                );
                const messageVisible =
                  option.code === "birthday_card" ||
                  option.code === "wishing_card"
                    ? customerPaidAddonMessageVisible(
                        option.code,
                        selections.paidAddonCodes,
                      )
                    : false;
                const messageRequired =
                  option.code === "birthday_card" ||
                  option.code === "wishing_card"
                    ? customerPaidAddonMessageRequired(
                        option.code,
                        selections.paidAddonCodes,
                      )
                    : false;
                const messageValue =
                  option.code === "birthday_card"
                    ? selections.birthdayCardMessage
                    : option.code === "wishing_card"
                      ? selections.wishingCardMessage
                      : "";
                return (
                  <div className="space-y-2" key={option.code}>
                    <FormCheckbox
                      checked={selected}
                      label={formatCustomerPreorderOptionLabel(
                        option.name,
                        option.unitPrice,
                      )}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelections((current) => ({
                          ...current,
                          paidAddonCodes: checked
                            ? [...current.paidAddonCodes, option.code]
                            : current.paidAddonCodes.filter(
                                (code) => code !== option.code,
                              ),
                        }));
                      }}
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
                            setSelections((current) =>
                              option.code === "birthday_card"
                                ? {
                                    ...current,
                                    birthdayCardMessage: event.target.value,
                                  }
                                : {
                                    ...current,
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
        </CheckoutSection>
      ) : null}

      <CheckoutSection
        className="border-fog border-t pt-10"
        title="Customer Details"
      >
        <FormField
          help={
            <>
              {CUSTOMER_NAME_HELP}
              <span className="mt-0.5 block">{CUSTOMER_NAME_SPACE_HINT}</span>
            </>
          }
          htmlFor="customer_name"
          label="Name"
        >
          <FormInput
            id="customer_name"
            name="customer_name"
            onChange={(event) => setCustomerName(event.target.value)}
            required
            value={customerName}
          />
        </FormField>
        <FormField
          help={WAITING_LIST_WHATSAPP_NOTE}
          htmlFor="phone"
          label="WhatsApp phone"
        >
          <FormInput
            id="phone"
            name="phone"
            onChange={(event) => setPhone(event.target.value)}
            required
            type="tel"
            value={phone}
          />
        </FormField>
        <FormRadioGroup
          legend="Would you like a copy of the receipt? (will be attached during pickup)"
          name="include_receipt"
          onChange={setIncludeReceipt}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          required
          value={includeReceipt}
        />
      </CheckoutSection>

      <CheckoutSection
        className="border-fog border-t pt-10"
        title="Order Notes"
      >
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
          id="notes"
          name="notes"
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          value={notes}
        />
      </CheckoutSection>

      <FormError message={state.error} />
      <FormActions className="border-fog border-t pt-8">
        <FormSubmitButton
          className="w-full rounded-md sm:w-auto"
          pending={pending}
          pendingLabel="Submitting…"
        >
          Submit confirmation
        </FormSubmitButton>
      </FormActions>
    </form>
  );
}
