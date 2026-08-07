"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FormInput } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { LibraryCake } from "@/types/library-cake";
import {
  cakeCategoryLabel,
  cakeStatusLabel,
  formatCakeSizePrices,
  libraryStatusTone,
} from "@/workspaces/library/labels";

type CakeDirectoryProps = {
  cakes: LibraryCake[];
};

export function CakeDirectory({ cakes }: CakeDirectoryProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return cakes;
    return cakes.filter(
      (cake) =>
        cake.name.toLowerCase().includes(trimmed) ||
        cakeCategoryLabel(cake.category).toLowerCase().includes(trimmed),
    );
  }, [cakes, query]);

  return (
    <div className="space-y-4">
      <FormInput
        aria-label="Search cakes"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name or category"
        value={query}
      />

      {filtered.length === 0 ? (
        <EmptyState
          description="Build the reusable Cake Library Studio will assemble into Collections."
          title="No cakes yet"
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((cake) => (
            <li
              className="border-fog rounded-xl border bg-white p-4"
              key={cake.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-ink truncate font-medium">{cake.name}</p>
                  <p className="text-skyline mt-1 text-sm">
                    {cakeCategoryLabel(cake.category)}
                  </p>
                  <p className="text-ink mt-1 text-sm">
                    {formatCakeSizePrices(cake.sizes)}
                  </p>
                </div>
                <StatusBadge
                  label={cakeStatusLabel(cake.status)}
                  tone={libraryStatusTone(cake.status)}
                />
              </div>
              <Link
                className="text-signal hover:text-ink mt-4 inline-flex min-h-11 items-center text-sm font-medium"
                href={`/library/cakes/${cake.id}`}
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
