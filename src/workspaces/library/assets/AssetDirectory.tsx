"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FormInput } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { LibraryAsset } from "@/types/library-asset";
import {
  assetKindLabel,
  assetStatusLabel,
  libraryStatusTone,
} from "@/workspaces/library/labels";

type AssetDirectoryProps = {
  assets: LibraryAsset[];
};

export function AssetDirectory({ assets }: AssetDirectoryProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return assets;
    return assets.filter(
      (asset) =>
        asset.title.toLowerCase().includes(trimmed) ||
        assetKindLabel(asset.kind).toLowerCase().includes(trimmed),
    );
  }, [assets, query]);

  return (
    <div className="space-y-4">
      <FormInput
        aria-label="Search assets"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by title or kind"
        value={query}
      />

      {filtered.length === 0 ? (
        <EmptyState
          description="Add reusable images for heroes, covers, and banners."
          title="No assets yet"
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((asset) => (
            <li
              className="border-fog rounded-xl border bg-white p-4"
              key={asset.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-ink truncate font-medium">{asset.title}</p>
                  <p className="text-skyline mt-1 text-sm">
                    {assetKindLabel(asset.kind)}
                  </p>
                </div>
                <StatusBadge
                  label={assetStatusLabel(asset.status)}
                  tone={libraryStatusTone(asset.status)}
                />
              </div>
              <Link
                className="text-signal hover:text-ink mt-4 inline-flex min-h-11 items-center text-sm font-medium"
                href={`/library/assets/${asset.id}`}
              >
                Open →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
