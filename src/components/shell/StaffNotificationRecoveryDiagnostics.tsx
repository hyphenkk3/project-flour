"use client";

import { useEffect, useState } from "react";

import {
  clearStaffNotificationRecoveryTrace,
  readStaffNotificationRecoveryTrace,
  type RealtimeTestControlState,
  type RecoveryDiagnosticRecord,
  type StaffNotificationRealtimeTestControls,
} from "@/foundation/staff/staff-notification-recovery-diagnostics";
import type { SafeRealtimeSubscriptionStatus } from "@/foundation/staff/staff-notification-live-fallback";

type Props = {
  enabled: boolean;
  expectedHostname: string;
  realtimeStatus: SafeRealtimeSubscriptionStatus;
  testControlState: RealtimeTestControlState;
  testControls: StaffNotificationRealtimeTestControls | null;
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
  realtimeStatus,
  testControlState,
  testControls,
}: Props) {
  const [records, setRecords] = useState<RecoveryDiagnosticRecord[]>([]);
  const [open, setOpen] = useState(false);
  const controlBusy =
    testControlState === "pausing" || testControlState === "resuming";
  const pauseEnabled =
    testControls !== null &&
    realtimeStatus === "SUBSCRIBED" &&
    !controlBusy &&
    testControlState !== "paused";
  const resumeEnabled =
    testControls !== null &&
    !controlBusy &&
    (testControlState === "paused" ||
      testControlState === "resume_failed" ||
      testControlState === "pause_failed");

  const runControl = (action: "pause" | "resume") => {
    const control = testControls?.[action];
    if (control) void control();
  };

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
      <section
        aria-label="DEV Realtime listener test controls"
        className="mt-2 border-t border-slate-200 pt-2"
      >
        <p aria-live="polite">
          Realtime: <strong>{realtimeStatus}</strong> · Test control:{" "}
          {testControlState.replaceAll("_", " ")}
        </p>
        {testControlState === "pause_failed" ? (
          <p role="status" className="mt-1 text-amber-800">
            Pause was not confirmed; the listener may still be active. Retry
            Pause only after the channel is SUBSCRIBED, or restore normal
            listening.
          </p>
        ) : null}
        {testControlState === "resume_failed" ? (
          <p role="status" className="mt-1 text-amber-800">
            Resume is not confirmed yet. The listener may reconnect
            automatically; retry Resume to wait for SUBSCRIBED again.
          </p>
        ) : null}
        <div className="mt-2 flex gap-2">
          <button
            className="rounded border border-slate-400 px-2 py-1 disabled:opacity-50"
            disabled={!pauseEnabled}
            onClick={() => runControl("pause")}
            type="button"
          >
            {testControlState === "pause_failed"
              ? "Retry Pause"
              : "Pause Realtime"}
          </button>
          <button
            className="rounded border border-slate-400 px-2 py-1 disabled:opacity-50"
            disabled={!resumeEnabled}
            onClick={() => runControl("resume")}
            type="button"
          >
            {testControlState === "resume_failed"
              ? "Retry Resume"
              : "Resume Realtime"}
          </button>
        </div>
        <p className="mt-1 text-slate-600">
          These controls remove or restore only this tab’s staff notification
          channel. They do not change preferences or create events.
        </p>
      </section>
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
