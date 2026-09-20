"use client";

import { useId, useState } from "react";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import {
  WAITING_LIST_AVAILABILITY_INTRO,
  WAITING_LIST_JOIN_CTA,
} from "@/engines/waiting-list/phone";
import { formatShortBusinessDate } from "@/lib/dates";
import { StorefrontOverlay } from "@/workspaces/storefront/StorefrontOverlay";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  JoinWaitingListForm,
  type JoinWaitingListLine,
} from "@/workspaces/storefront/waiting-list/JoinWaitingListForm";
import type { CustomerWaitingListAvailabilityOption } from "@/workspaces/storefront/waiting-list/availability-types";

type CustomerWaitingListAvailabilityProps = {
  pickupDate: string;
  collectionId: string | null;
  options: readonly CustomerWaitingListAvailabilityOption[];
  open: boolean;
  onClose: () => void;
};

function formatWaitingListDate(ymd: string): string {
  const year = ymd.slice(0, 4);
  const short = formatShortBusinessDate(ymd);
  return /^\d{4}$/.test(year) ? `${short} ${year}` : short;
}

export function CustomerWaitingListAvailability({
  pickupDate,
  collectionId,
  options,
  open,
  onClose,
}: CustomerWaitingListAvailabilityProps) {
  const titleId = useId();
  const [selected, setSelected] = useState<JoinWaitingListLine | null>(null);

  if (!open) return null;

  const line: JoinWaitingListLine | null = selected
    ? { ...selected, quantity: selected.quantity || 1 }
    : null;

  return (
    <StorefrontOverlay
      labelledBy={titleId}
      panelClassName="border-fog bg-mist text-ink flex max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden rounded-t-lg border md:max-h-[calc(100dvh-5rem)] md:max-w-lg md:rounded-lg"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6 md:pt-5 md:pb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-signal text-[11px] font-medium tracking-[0.22em] uppercase">
              Waiting List
            </p>
            <h2
              className="font-display text-ink mt-1 text-2xl tracking-tight"
              id={titleId}
            >
              {formatWaitingListDate(pickupDate)}
            </h2>
          </div>
          <button
            aria-label="Close"
            className="text-skyline hover:text-ink inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center text-sm font-medium"
            onClick={() => {
              setSelected(null);
              onClose();
            }}
            type="button"
          >
            Close
          </button>
        </div>

        {line ? (
          <div className="mt-5">
            <button
              className="text-signal mb-4 text-sm font-medium"
              onClick={() => setSelected(null)}
              type="button"
            >
              Back
            </button>
            <JoinWaitingListForm
              collectionId={collectionId}
              lines={[line]}
              pickupDate={pickupDate}
            />
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <p className="text-skyline text-sm leading-relaxed">
              {WAITING_LIST_AVAILABILITY_INTRO}
            </p>
            <ul className="space-y-3">
              {options.map((option) => (
                <li
                  className="border-fog flex items-center gap-3 border bg-white px-3 py-3"
                  key={`${option.cakeId}|${option.sizeId}`}
                >
                  <div className="bg-fog relative h-16 w-16 shrink-0 overflow-hidden rounded-[10px]">
                    {option.photoUrl ? (
                      <CakePhotoImage
                        alt={option.photoAlt || option.cakeName}
                        sizes="64px"
                        src={option.photoUrl}
                      />
                    ) : (
                      <div className="text-skyline flex h-full items-center justify-center px-1 text-center text-[10px]">
                        Photo coming soon
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink text-sm font-medium">
                      {option.cakeName}
                    </p>
                    <p className="text-skyline mt-0.5 text-sm">
                      {option.sizeLabel} · {formatRm(option.price)}
                    </p>
                  </div>
                  <button
                    className="border-ink text-ink inline-flex min-h-11 shrink-0 items-center justify-center border px-3 text-sm font-medium"
                    onClick={() =>
                      setSelected({
                        cakeId: option.cakeId,
                        sizeId: option.sizeId,
                        cakeName: option.cakeName,
                        sizeLabel: option.sizeLabel,
                        quantity: 1,
                      })
                    }
                    type="button"
                  >
                    Select
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-skyline text-xs leading-relaxed">
              {WAITING_LIST_JOIN_CTA} is a waiting-list request, not a confirmed
              order.
            </p>
          </div>
        )}
      </div>
    </StorefrontOverlay>
  );
}
