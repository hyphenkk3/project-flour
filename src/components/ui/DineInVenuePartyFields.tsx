"use client";

import { FormCheckbox, FormField, FormInput } from "@/components/ui/form";
import type { DineInVenue } from "@/engines/business-calendar/dine-in-hours";
import {
  DINE_IN_BABY_CHAIR_NOTICE,
  DINE_IN_HYPHEN_COMBINE_NOTE,
  DINE_IN_VENUE_CUSTOMER_COPY,
  DINE_IN_VENUE_PHOTO_SRC,
  DINE_IN_WHITEBIRD_GROUP_SIZE_BODY,
  DINE_IN_WHITEBIRD_GROUP_SIZE_TITLE,
  DINE_IN_WHITEBIRD_SPLIT_SEATING_ACK_LABEL,
  derivedGuestCountDraft,
  parseDineInPartyCounts,
  shouldRequireWhitebirdSplitSeatingAck,
  shouldShowBabyChairNotice,
  shouldShowHyphenCombineNote,
  shouldShowWhitebirdSplitSeatingWarning,
} from "@/engines/orders/dine-in-party";

export type DineInVenuePartyFieldsValue = {
  venue: string;
  adultCount: string;
  kidCount: string;
  toddlerCount: string;
  whitebirdSplitSeatingAcknowledged: boolean;
};

type DineInVenuePartyFieldsProps = {
  venues: readonly DineInVenue[];
  value: DineInVenuePartyFieldsValue;
  onChange: (next: DineInVenuePartyFieldsValue) => void;
  requireAcknowledgement?: boolean;
  idPrefix?: string;
};

function patchValue(
  current: DineInVenuePartyFieldsValue,
  patch: Partial<DineInVenuePartyFieldsValue>,
): DineInVenuePartyFieldsValue {
  const next = { ...current, ...patch };
  const parsed = parseDineInPartyCounts(next);
  const total = parsed.ok ? parsed.counts.totalGuestCount : 0;
  if (
    !shouldShowWhitebirdSplitSeatingWarning(next.venue, total) &&
    next.whitebirdSplitSeatingAcknowledged
  ) {
    next.whitebirdSplitSeatingAcknowledged = false;
  }
  return next;
}

export function DineInVenuePartyFields({
  venues,
  value,
  onChange,
  requireAcknowledgement = true,
  idPrefix = "",
}: DineInVenuePartyFieldsProps) {
  const parsed = parseDineInPartyCounts(value);
  const total = parsed.ok ? parsed.counts.totalGuestCount : 0;
  const showWarning = shouldShowWhitebirdSplitSeatingWarning(
    value.venue,
    total,
  );
  const showAck = shouldRequireWhitebirdSplitSeatingAck({
    venue: value.venue,
    totalGuestCount: total,
    requireAcknowledgement,
  });
  const showBabyChair = parsed.ok
    ? shouldShowBabyChairNotice(parsed.counts.toddlerCount)
    : false;
  const showHyphenNote = shouldShowHyphenCombineNote(value.venue);
  const adultId = `${idPrefix}adult_count`;
  const kidId = `${idPrefix}kid_count`;
  const toddlerId = `${idPrefix}toddler_count`;

  return (
    <div className="space-y-3">
      {venues.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-ink text-sm font-medium">Venue</legend>
          <div className="grid gap-2">
            {venues.map((venue, index) => {
              const copy = DINE_IN_VENUE_CUSTOMER_COPY[venue];
              const photoSrc = DINE_IN_VENUE_PHOTO_SRC[venue];
              const selected = value.venue === venue;
              return (
                <label
                  className={`flex min-h-12 cursor-pointer gap-3 rounded-lg border bg-white p-3 ${
                    selected ? "border-[var(--color-signal)]" : "border-fog"
                  }`}
                  key={venue}
                >
                  <input
                    checked={selected}
                    className="mt-1 size-4 accent-[var(--color-signal)]"
                    name="dine_in_venue"
                    onChange={() => onChange(patchValue(value, { venue }))}
                    required={index === 0}
                    type="radio"
                    value={venue}
                  />
                  <span className="min-w-0 flex-1">
                    {photoSrc ? (
                      <span
                        aria-hidden="true"
                        className="bg-fog mb-2 block h-16 w-full overflow-hidden rounded-md bg-cover bg-center"
                        style={{ backgroundImage: `url(${photoSrc})` }}
                      />
                    ) : null}
                    <span className="text-ink block text-sm font-medium tracking-[0.08em] uppercase">
                      {copy.name}
                    </span>
                    <span className="text-skyline mt-0.5 block text-sm">
                      {copy.level}
                    </span>
                    {copy.access ? (
                      <span className="text-skyline mt-0.5 block text-xs leading-snug">
                        {copy.access}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-ink text-sm font-medium">Party size</legend>
        <div className="grid grid-cols-3 gap-2">
          <FormField htmlFor={adultId} label="Adults">
            <FormInput
              id={adultId}
              inputMode="numeric"
              max={50}
              min={0}
              name="adult_count"
              onChange={(event) =>
                onChange(patchValue(value, { adultCount: event.target.value }))
              }
              required
              step={1}
              type="number"
              value={value.adultCount}
            />
          </FormField>
          <FormField htmlFor={kidId} label="Kids">
            <FormInput
              id={kidId}
              inputMode="numeric"
              max={50}
              min={0}
              name="kid_count"
              onChange={(event) =>
                onChange(patchValue(value, { kidCount: event.target.value }))
              }
              step={1}
              type="number"
              value={value.kidCount}
            />
          </FormField>
          <FormField htmlFor={toddlerId} label="Toddlers">
            <FormInput
              id={toddlerId}
              inputMode="numeric"
              max={50}
              min={0}
              name="toddler_count"
              onChange={(event) =>
                onChange(
                  patchValue(value, { toddlerCount: event.target.value }),
                )
              }
              step={1}
              type="number"
              value={value.toddlerCount}
            />
          </FormField>
        </div>
        <p className="text-ink text-sm">
          Total guests:{" "}
          <span className="font-medium">
            {parsed.ok ? parsed.counts.totalGuestCount : "—"}
          </span>
        </p>
        <input
          name="guest_count"
          type="hidden"
          value={derivedGuestCountDraft(value)}
        />
      </fieldset>

      {showHyphenNote ? (
        <p className="text-skyline text-sm">{DINE_IN_HYPHEN_COMBINE_NOTE}</p>
      ) : null}

      {showWarning ? (
        <div
          className="border-signal/40 bg-signal/5 rounded-lg border px-3 py-2.5"
          role="status"
        >
          <p className="text-ink text-sm font-semibold">
            {DINE_IN_WHITEBIRD_GROUP_SIZE_TITLE}
          </p>
          <p className="text-ink mt-1 text-sm leading-relaxed">
            {DINE_IN_WHITEBIRD_GROUP_SIZE_BODY}
          </p>
        </div>
      ) : null}

      {showAck ? (
        <FormCheckbox
          checked={value.whitebirdSplitSeatingAcknowledged}
          label={DINE_IN_WHITEBIRD_SPLIT_SEATING_ACK_LABEL}
          name="whitebird_split_seating_acknowledged"
          onChange={(event) =>
            onChange(
              patchValue(value, {
                whitebirdSplitSeatingAcknowledged: event.target.checked,
              }),
            )
          }
          required
        />
      ) : null}

      {showBabyChair ? (
        <p className="text-skyline text-sm">{DINE_IN_BABY_CHAIR_NOTICE}</p>
      ) : null}
    </div>
  );
}
