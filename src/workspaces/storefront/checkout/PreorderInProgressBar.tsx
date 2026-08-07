"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  draftCakeCount,
  draftHasItems,
  draftTotal,
  readPreorderDraft,
} from "@/workspaces/storefront/checkout/preorder-draft";

/**
 * Subtle in-progress preorder indicator for Collection / Cake Detail.
 * Client-only — draft lives in sessionStorage.
 */
export function PreorderInProgressBar() {
  const [summary, setSummary] = useState<{
    cakeCount: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    function refresh() {
      const draft = readPreorderDraft();
      if (!draftHasItems(draft)) {
        setSummary(null);
        return;
      }
      setSummary({
        cakeCount: draftCakeCount(draft),
        total: draftTotal(draft),
      });
    }

    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (!summary) return null;

  const cakeLabel = summary.cakeCount === 1 ? "1 cake" : `${summary.cakeCount} cakes`;

  return (
    <div className="border-fog mb-6 rounded-xl border bg-white px-4 py-3">
      <Link
        className="text-ink hover:text-signal flex flex-wrap items-center justify-between gap-2 text-sm"
        href="/order"
      >
        <span className="font-medium">Your Preorder · {cakeLabel}</span>
        <span className="text-skyline tabular-nums">
          {formatRm(summary.total)}
          <span className="text-ink"> · View →</span>
        </span>
      </Link>
    </div>
  );
}
