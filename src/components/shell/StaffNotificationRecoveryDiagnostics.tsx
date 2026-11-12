"use client";

import { useEffect, useState } from "react";

import {
  clearStaffNotificationRecoveryTrace,
  readStaffNotificationRecoveryTrace,
  type RecoveryDiagnosticRecord,
} from "@/foundation/staff/staff-notification-recovery-diagnostics";

type Props = {
  enabled: boolean;
  expectedHostname: string;
};

function recordSummary(record: RecoveryDiagnosticRecord): string {
  const details = [
    record.runId ? `run=${record.runId}` : null,
    record.source ? `source=${record.source}` : null,
    record.outcome ? `outcome=${record.outcome}` : null,
    record.reason ? `reason=${record.reason}` : null,
    record.status ? `status=${record.status}` : null,
    record.eventId ? `event=${record.eventId}` : null,
    record.cursorId ? `cursor=${record.cursorId}` : null,
    record.count !== undefined ? `count=${record.count}` : null,
    record.limit !== undefined ? `limit=${record.limit}` : null,
    record.eligible !== undefined ? `eligible=${record.eligible}` : null,
    record.pending !== undefined ? `pending=${record.pending}` : null,
    record.visible !== undefined ? `retry=${record.visible}` : null,
  ].filter(Boolean);
  return details.join(" · ");
}

export function StaffNotificationRecoveryDiagnostics({
  enabled,
  expectedHostname,
}: Props) {
  const [records, setRecords] = useState<RecoveryDiagnosticRecord[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled || window.location.hostname !== expectedHostname) return;
    const refresh = () => setRecords(readStaffNotificationRecoveryTrace());
    refresh();
    window.addEventListener(
      "staff-notification-recovery-trace-updated",
      refresh,
    );
    return () =>
      window.removeEventListener(
        "staff-notification-recovery-trace-updated",
        refresh,
      );
  }, [enabled, expectedHostname]);

  if (!enabled) return null;
  if (
    typeof window !== "undefined" &&
    window.location.hostname !== expectedHostname
  ) {
    return null;
  }

  return (
    <aside className="fixed right-3 bottom-3 z-[90] w-[min(34rem,calc(100vw-1.5rem))] rounded-xl border border-slate-500 bg-white p-3 text-xs text-slate-900 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <button
          aria-expanded={open}
          className="font-semibold underline"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          DEV recovery trace ({records.length})
        </button>
        <button
          className="underline"
          onClick={clearStaffNotificationRecoveryTrace}
          type="button"
        >
          Clear trace
        </button>
      </div>
      {open ? (
        <div className="mt-2 max-h-72 overflow-auto border-t border-slate-200 pt-2">
          <p className="mb-2 text-slate-600">
            Local to this tab, last hour, maximum 200 entries. “Toast mounted”
            confirms DOM mounting, not that a person saw it. Clear when
            finished.
          </p>
          {records.length === 0 ? (
            <p className="text-slate-600">No trace entries.</p>
          ) : (
            <ol className="space-y-1 font-mono">
              {records.map((record, index) => (
                <li key={`${record.at}-${record.kind}-${index}`}>
                  {new Date(record.at).toISOString()} {record.kind}
                  {recordSummary(record) ? ` — ${recordSummary(record)}` : ""}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </aside>
  );
}
