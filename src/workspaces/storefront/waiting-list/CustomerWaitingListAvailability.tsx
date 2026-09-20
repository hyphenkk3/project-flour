"use client";

import { useId, useMemo, useState } from "react";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import {
  WAITING_LIST_AVAILABILITY_INTRO,
  WAITING_LIST_CONTINUE_CTA,
  WAITING_LIST_JOIN_CTA,
} from "@/engines/waiting-list/phone";
import { waitingListCartLineKey } from "@/engines/waiting-list/eligibility";
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

const WAITING_LIST_REQUEST_QTY_MAX = 99;

function formatWaitingListDate(ymd: string): string {
  const year = ymd.slice(0, 4);
  const short = formatShortBusinessDate(ymd);
  return /^\d{4}$/.test(year) ? `${short} ${year}` : short;
}

function WaitingListQuantityStepper({
  cakeName,
  sizeLabel,
  quantity,
  onChange,
}: {
  cakeName: string;
  sizeLabel: string;
  quantity: number;
  onChange: (quantity: number) => void;
}) {
  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label={`${cakeName} ${sizeLabel} quantity`}
    >
      <button
        aria-label={`Decrease ${cakeName} ${sizeLabel} quantity`}
        className="text-ink inline-flex min-h-11 min-w-11 items-center justify-center text-lg disabled:opacity-40"
        disabled={quantity <= 0}
        onClick={() => onChange(Math.max(0, quantity - 1))}
        type="button"
      >
        −
      </button>
      <span
        aria-live="polite"
        className="text-ink min-w-8 text-center text-sm font-medium tabular-nums"
      >
        {quantity}
      </span>
      <button
        aria-label={`Increase ${cakeName} ${sizeLabel} quantity`}
        className="text-ink inline-flex min-h-11 min-w-11 items-center justify-center text-lg disabled:opacity-40"
        disabled={quantity >= WAITING_LIST_REQUEST_QTY_MAX}
        onClick={() =>
          onChange(Math.min(WAITING_LIST_REQUEST_QTY_MAX, quantity + 1))
        }
        type="button"
      >
        +
      </button>
    </div>
  );
}

function CustomerWaitingListAvailabilityBody({
  pickupDate,
  collectionId,
  options,
  onClose,
}: Omit<CustomerWaitingListAvailabilityProps, "open">) {
  const titleId = useId();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [step, setStep] = useState<"select" | "details">("select");

  const selectedLines = useMemo<JoinWaitingListLine[]>(() => {
    const lines: JoinWaitingListLine[] = [];
    for (const option of options) {
      const key = waitingListCartLineKey(option.cakeId, option.sizeId);
      const quantity = quantities[key] ?? 0;
      if (quantity < 1) continue;
      lines.push({
        cakeId: option.cakeId,
        sizeId: option.sizeId,
        cakeName: option.cakeName,
        sizeLabel: option.sizeLabel,
        quantity,
      });
    }
    return lines;
  }, [options, quantities]);

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
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        {step === "details" ? (
          <div className="mt-5">
            <button
              className="text-signal mb-4 text-sm font-medium"
              onClick={() => setStep("select")}
              type="button"
            >
              Back
            </button>
            <JoinWaitingListForm
              collectionId={collectionId}
              lines={selectedLines}
              pickupDate={pickupDate}
            />
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <p className="text-skyline text-sm leading-relaxed">
              {WAITING_LIST_AVAILABILITY_INTRO}
            </p>
            <ul className="space-y-3">
              {options.map((option) => {
                const key = waitingListCartLineKey(option.cakeId, option.sizeId);
                const quantity = quantities[key] ?? 0;
                return (
                  <li
                    className="border-fog flex items-center gap-3 border bg-white px-3 py-3"
                    key={key}
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
                      <p className="text-skyline mt-1 text-xs">Quantity</p>
                    </div>
                    <WaitingListQuantityStepper
                      cakeName={option.cakeName}
                      onChange={(next) =>
                        setQuantities((current) => ({
                          ...current,
                          [key]: next,
                        }))
                      }
                      quantity={quantity}
                      sizeLabel={option.sizeLabel}
                    />
                  </li>
                );
              })}
            </ul>
            <button
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-md px-5 text-sm font-medium transition duration-200 disabled:opacity-50"
              disabled={selectedLines.length === 0}
              onClick={() => setStep("details")}
              type="button"
            >
              {WAITING_LIST_CONTINUE_CTA}
            </button>
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

export function CustomerWaitingListAvailability({
  pickupDate,
  collectionId,
  options,
  open,
  onClose,
}: CustomerWaitingListAvailabilityProps) {
  if (!open) return null;

  return (
    <CustomerWaitingListAvailabilityBody
      collectionId={collectionId}
      key={pickupDate}
      onClose={onClose}
      options={options}
      pickupDate={pickupDate}
    />
  );
}
