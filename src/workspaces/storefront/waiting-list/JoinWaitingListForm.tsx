"use client";

import { useActionState, useMemo, useState } from "react";
import {
  FormActions,
  FormError,
  FormField,
  FormInput,
  FormRadioGroup,
  FormSubmitButton,
} from "@/components/ui/form";
import { consolidateWaitingListRequestItems } from "@/engines/waiting-list/eligibility";
import {
  WAITING_LIST_ACK_CONTACT,
  WAITING_LIST_JOIN_CTA,
  WAITING_LIST_NAME_HELP,
  WAITING_LIST_REQUEST_NOT_ORDER,
  WAITING_LIST_WHATSAPP_NOTE,
  waitingListOtherFlavoursQuestion,
} from "@/engines/waiting-list/phone";
import { formatShortBusinessDate } from "@/lib/dates";
import {
  submitGuestWaitingListAction,
  type GuestWaitingListState,
} from "@/workspaces/storefront/waiting-list/actions";

export type JoinWaitingListLine = {
  cakeId: string;
  sizeId: string;
  cakeName: string;
  sizeLabel: string;
  quantity: number;
};

type JoinWaitingListFormProps = {
  pickupDate: string;
  collectionId: string | null;
  lines: readonly JoinWaitingListLine[];
};

const initialState: GuestWaitingListState = { error: null };

function formatWaitingListDate(ymd: string): string {
  const year = ymd.slice(0, 4);
  const short = formatShortBusinessDate(ymd);
  return /^\d{4}$/.test(year) ? `${short} ${year}` : short;
}

export function JoinWaitingListForm({
  pickupDate,
  collectionId,
  lines,
}: JoinWaitingListFormProps) {
  const [state, formAction, pending] = useActionState(
    submitGuestWaitingListAction,
    initialState,
  );
  const [openToAlternatives, setOpenToAlternatives] = useState("");
  const selectedLines = useMemo(
    () => consolidateWaitingListRequestItems(lines),
    [lines],
  );
  const itemsJson = useMemo(
    () =>
      JSON.stringify(
        selectedLines.map((line) => ({
          cake_id: line.cakeId,
          cake_size_id: line.sizeId,
          quantity: line.quantity,
        })),
      ),
    [selectedLines],
  );

  if (selectedLines.length === 0) return null;

  return (
    <section className="border-fog space-y-4 border-t pt-5">
      <div>
        <h2 className="text-ink text-sm font-semibold tracking-tight">
          {WAITING_LIST_JOIN_CTA}
        </h2>
        <p className="text-ink mt-1 text-sm">{formatWaitingListDate(pickupDate)}</p>
      </div>
      <ul className="text-ink space-y-1 text-sm">
        {selectedLines.map((line) => (
          <li key={`${line.cakeId}|${line.sizeId}`}>
            {line.cakeName} · {line.sizeLabel} × {line.quantity}
          </li>
        ))}
      </ul>
      <p className="text-skyline text-sm leading-relaxed">
        {WAITING_LIST_REQUEST_NOT_ORDER}
      </p>
      <form action={formAction} className="space-y-3">
        <input name="pickup_date" type="hidden" value={pickupDate} />
        <input name="collection_id" type="hidden" value={collectionId ?? ""} />
        <input name="items_json" type="hidden" value={itemsJson} />
        <FormField
          help={WAITING_LIST_NAME_HELP}
          htmlFor="wl_customer_name"
          label="Name"
        >
          <FormInput id="wl_customer_name" name="customer_name" required />
        </FormField>
        <FormField
          help={WAITING_LIST_WHATSAPP_NOTE}
          htmlFor="wl_phone"
          label="WhatsApp phone"
        >
          <FormInput
            id="wl_phone"
            inputMode="numeric"
            name="phone"
            pattern="[0-9]*"
            required
            type="tel"
          />
        </FormField>
        <FormRadioGroup
          legend={waitingListOtherFlavoursQuestion(pickupDate)}
          name="open_to_alternatives"
          onChange={setOpenToAlternatives}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          required
          value={openToAlternatives}
        />
        <p className="text-skyline text-xs leading-relaxed">
          {WAITING_LIST_ACK_CONTACT}
        </p>
        <FormError message={state.error} />
        <FormActions>
          <FormSubmitButton pending={pending}>
            {WAITING_LIST_JOIN_CTA}
          </FormSubmitButton>
        </FormActions>
      </form>
    </section>
  );
}
