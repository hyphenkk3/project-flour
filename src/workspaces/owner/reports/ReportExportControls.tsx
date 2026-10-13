"use client";

import { useRef, useState } from "react";

type ExportFormat = "pdf" | "excel";

export function ReportExportControls({ month }: { month: string }) {
  const [loading, setLoading] = useState<ExportFormat | null>(null);
  const [error, setError] = useState("");
  const requestInFlight = useRef(false);

  const download = async (format: ExportFormat) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setLoading(format);
    setError("");
    try {
      const extension = format === "pdf" ? "pdf" : "xlsx";
      const response = await fetch(
        `/api/owner/management/reports/export/${format}?month=${encodeURIComponent(month)}`,
        { method: "GET", credentials: "same-origin", cache: "no-store" },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "The report export could not be generated.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `Whitebird_Report_${month}.${extension}`;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The report export could not be generated. Please retry.",
      );
    } finally {
      requestInFlight.current = false;
      setLoading(null);
    }
  };

  return (
    <div className="min-w-0 space-y-1" aria-busy={loading !== null}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void download("pdf")}
          disabled={loading !== null}
          className="min-h-10 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60 sm:flex-none"
        >
          {loading === "pdf" ? "Preparing PDF…" : "Export PDF"}
        </button>
        <button
          type="button"
          onClick={() => void download("excel")}
          disabled={loading !== null}
          className="min-h-10 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60 sm:flex-none"
        >
          {loading === "excel" ? "Preparing Excel…" : "Export Excel"}
        </button>
      </div>
      {loading && (
        <p className="text-xs text-slate-600" role="status" aria-live="polite">
          Preparing the {loading === "excel" ? "Excel workbook" : "PDF report"} for {month}…
        </p>
      )}
      {error && (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
