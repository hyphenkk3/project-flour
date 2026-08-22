"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FormInput } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { LibraryPromotion } from "@/types/library-promotion";
import {
  libraryStatusTone,
  promotionStatusLabel,
} from "@/workspaces/library/labels";

type PromotionDirectoryProps = {
  promotions: LibraryPromotion[];
  canManage: boolean;
};

export function PromotionDirectory({ promotions, canManage }: PromotionDirectoryProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return promotions;
    return promotions.filter((item) =>
      item.name.toLowerCase().includes(trimmed),
    );
  }, [promotions, query]);

  return (
    <div className="space-y-4">
      <FormInput
        aria-label="Search promotions"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name"
        value={query}
      />

      {filtered.length === 0 ? (
        <EmptyState
          description="Create reusable promotion records for future catalogues."
          title="No promotions yet"
        />
      ) : (
        <ul className="divide-fog border-fog divide-y rounded-xl border bg-white">
          {filtered.map((promotion) => (
            <li
              className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              key={promotion.id}
            >
              <div>
                <p className="text-ink font-medium">{promotion.name}</p>
                <p className="text-skyline mt-1 text-sm">
                  {promotion.validFrom ?? "—"} → {promotion.validUntil ?? "—"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge
                  label={promotionStatusLabel(promotion.status)}
                  tone={libraryStatusTone(promotion.status)}
                />
                <Link
                  className="text-signal hover:text-ink text-sm font-medium"
                  href={`/library/promotions/${promotion.id}`}
                >
                  Open →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
