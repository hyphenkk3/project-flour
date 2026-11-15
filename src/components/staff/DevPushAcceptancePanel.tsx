"use client";

import { useState } from "react";

const CONFIRMATIONS = [
  {
    key: "devWebAudienceAccepted",
    text: "I understand that this DEV test notification may appear in any of the seven Web-eligible DEV staff accounts, all of which I control. No Production staff account or customer is an intended recipient.",
  },
  {
    key: "ownerSubscriptionsAccountedFor",
    text: "",
  },
  {
    key: "iphonePermissionAndForceCloseReady",
    text: "The intended iPhone Home Screen app is ready, notification permission is granted, and I will force-close it before the one event.",
  },
  {
    key: "freshPickScheduleVerifiedDisabled",
    text: "I verified the Fresh Pick business schedule is disabled and accept the separate reminder-job activity described above.",
  },
  {
    key: "freshPickPushVerifiedOff",
    text: "Fresh Pick Push remains OFF.",
  },
  {
    key: "pushBatchRetryScheduleDisabled",
    text: "I verified no Push batch or retry schedule is enabled.",
  },
  {
    key: "emailVerifiedFrozen",
    text: "Email remains frozen; I understand this action will not send Email.",
  },
] as const;

const ENDPOINT = "/api/staff/notifications/dev-push-acceptance";

type ApiResult = {
  ok?: boolean;
  action?: string;
  deploymentId?: string;
  commitSha?: string;
  audience?: Record<string, number>;
  ownerSubscriptionCount?: number;
  result?: string;
  code?: string | null;
  eventId?: string | null;
  dispatch?: Record<string, number | string>;
};

export function DevPushAcceptancePanel({
  deploymentId,
  commitSha,
  ownerSubscriptionCount,
}: {
  deploymentId: string;
  commitSha: string;
  ownerSubscriptionCount: number;
}) {
  const [typedDeploymentId, setTypedDeploymentId] = useState("");
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [armed, setArmed] = useState(false);
  const [sendPhrase, setSendPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [message, setMessage] = useState<ApiResult | { error: string } | null>(
    null,
  );

  const allConfirmed = CONFIRMATIONS.every(({ key }) => acknowledged[key]);

  async function submit(action: "arm" | "execute") {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          deploymentId: typedDeploymentId,
          commitSha,
          ownerSubscriptionCount,
          confirmations: Object.fromEntries(
            CONFIRMATIONS.map(({ key }) => [key, acknowledged[key] === true]),
          ),
        }),
      });
      const result = (await response.json()) as ApiResult;
      setMessage(result);
      if (action === "arm" && response.ok) setArmed(true);
      if (action === "execute") setTerminal(true);
      if (!response.ok && action === "execute") setArmed(false);
    } catch {
      setMessage({
        error:
          "Request outcome is unknown. Do not retry; check the event key and queue through the approved read-only process.",
      });
      if (action === "execute") setTerminal(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 rounded-lg border border-slate-300 bg-white p-4 shadow-sm sm:p-6">
      <div className="space-y-1 text-sm text-slate-700">
        <p className="font-bold tracking-wide text-amber-800">
          DEV TEST — NOT A REAL ORDER
        </p>
        <p>
          <span className="font-semibold text-slate-950">
            Preview deployment:
          </span>{" "}
          <code className="break-all">{deploymentId}</code>
        </p>
        <p>
          <span className="font-semibold text-slate-950">Source commit:</span>{" "}
          <code className="break-all">{commitSha}</code>
        </p>
        <p>
          <span className="font-semibold text-slate-950">
            Active DEV Push subscriptions:
          </span>{" "}
          {ownerSubscriptionCount} (maximum accepted: 10). The count is checked
          again before arming and immediately before execution.
        </p>
      </div>

      <label className="block space-y-2 text-sm font-medium text-slate-900">
        Type the exact Preview deployment ID to confirm this deployment.
        <input
          value={typedDeploymentId}
          onChange={(event) => setTypedDeploymentId(event.target.value.trim())}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
          aria-label="Confirm exact Preview deployment ID"
        />
      </label>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold text-slate-950">
          Confirm each current safety condition
        </legend>
        {CONFIRMATIONS.map(({ key, text }) => (
          <label
            key={key}
            className="flex items-start gap-3 text-sm leading-5 text-slate-800"
          >
            <input
              type="checkbox"
              checked={acknowledged[key] === true}
              onChange={(event) =>
                setAcknowledged((current) => ({
                  ...current,
                  [key]: event.target.checked,
                }))
              }
              className="mt-1 size-4 shrink-0"
            />
            <span>
              {key === "ownerSubscriptionsAccountedFor"
                ? `I confirm all ${ownerSubscriptionCount} active DEV Push subscriptions belong to my iPhone, and I accept that this single test event may produce multiple notification displays.`
                : text}
            </span>
          </label>
        ))}
      </fieldset>

      {!armed ? (
        <button
          type="button"
          disabled={
            busy ||
            terminal ||
            typedDeploymentId !== deploymentId ||
            !allConfirmed
          }
          onClick={() => void submit("arm")}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Checking…" : "Arm this Preview (no event created)"}
        </button>
      ) : (
        <div className="space-y-4 border-t border-slate-200 pt-4">
          <p className="text-sm font-semibold text-amber-800">
            Armed for five minutes. The next action is irreversible and will not
            be retried.
          </p>
          <label className="block space-y-2 text-sm font-medium text-slate-900">
            Type <code>SEND ONE DEV PUSH</code> to create and dispatch the
            single fixed event.
            <input
              value={sendPhrase}
              onChange={(event) => setSendPhrase(event.target.value)}
              autoComplete="off"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={busy || terminal || sendPhrase !== "SEND ONE DEV PUSH"}
            onClick={() => void submit("execute")}
            className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "One attempt in progress…" : "Create and dispatch once"}
          </button>
        </div>
      )}

      {message ? (
        <pre
          className="overflow-x-auto rounded-md bg-slate-100 p-3 text-xs text-slate-800"
          role="status"
        >
          {JSON.stringify(message, null, 2)}
        </pre>
      ) : null}

      {terminal ? (
        <p className="text-sm font-semibold text-red-800">
          This page is locked for this attempt. Do not refresh, retry, delete
          the event, or generate a replacement key.
        </p>
      ) : null}
    </div>
  );
}
