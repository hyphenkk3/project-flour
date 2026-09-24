"use client";

import { formatLongBusinessDayMonthYear } from "@/lib/dates";

type RegisteredRm10ExpiredNoticeProps = {
  originalExpiry: string;
  canOverride: boolean;
  confirmed: boolean;
  onConfirm: () => void;
  onBack: () => void;
};

export function RegisteredRm10ExpiredNotice({
  originalExpiry,
  canOverride,
  confirmed,
  onConfirm,
  onBack,
}: RegisteredRm10ExpiredNoticeProps) {
  return (
    <div className="border-status-warning/30 bg-status-warning-soft space-y-3 rounded-lg border px-4 py-3">
      <p className="text-status-warning text-sm font-medium">Voucher Expired</p>
      <p className="text-ink text-sm">
        {`This physical voucher expired on ${formatLongBusinessDayMonthYear(originalExpiry)}. Using it requires Owner Override.`}
      </p>
      {canOverride ? (
        confirmed ? (
          <button
            className="text-skyline hover:text-ink text-sm font-medium"
            onClick={onBack}
            type="button"
          >
            Back
          </button>
        ) : (
          <button
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium"
            onClick={onConfirm}
            type="button"
          >
            Use Owner Override
          </button>
        )
      ) : (
        <p className="text-skyline text-sm">
          Redemption is not allowed without Owner Override.
        </p>
      )}
    </div>
  );
}
