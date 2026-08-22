"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FormField, FormInput, FormSelect } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  DEFAULT_LIBRARY_CAKE_SORT,
  type LibraryCakeSortId,
} from "@/engines/menu/cake-library-list";
import type { LibraryCake } from "@/types/library-cake";
import {
  applyLibraryCakeDirectory,
  type LibraryCakeCategoryFilter,
  type LibraryCakeStatusFilter,
} from "@/workspaces/library/cakes/directory-view";
import {
  LIBRARY_CAKE_CATEGORIES,
  LIBRARY_CAKE_STATUSES,
  cakeCategoryLabel,
  cakeStatusLabel,
  formatCakeSizePrices,
  libraryStatusTone,
} from "@/workspaces/library/labels";

const SORT_OPTIONS: Array<{ id: LibraryCakeSortId; label: string }> = [
  { id: "name_asc", label: "Name A–Z" },
  { id: "name_desc", label: "Name Z–A" },
  { id: "price_asc", label: "Price: lowest first" },
  { id: "price_desc", label: "Price: highest first" },
  { id: "size_asc", label: "Size: smallest first" },
  { id: "size_desc", label: "Size: largest first" },
  { id: "category_asc", label: "Category A–Z" },
  { id: "category_desc", label: "Category Z–A" },
  { id: "status_asc", label: "Status" },
  { id: "status_desc", label: "Status (reverse)" },
  { id: "updated_desc", label: "Recently updated" },
  { id: "updated_asc", label: "Oldest updated" },
];

type CakeDirectoryProps = {
  cakes: LibraryCake[];
  canManage: boolean;
};

export function CakeDirectory({ cakes, canManage }: CakeDirectoryProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LibraryCakeSortId>(DEFAULT_LIBRARY_CAKE_SORT);
  const [category, setCategory] = useState<LibraryCakeCategoryFilter>("all");
  const [status, setStatus] = useState<LibraryCakeStatusFilter>("all");

  const visible = useMemo(
    () => applyLibraryCakeDirectory(cakes, { query, category, status, sort }),
    [cakes, query, category, status, sort],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <FormInput
          aria-label="Search cakes"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or category"
          value={query}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField htmlFor="library-cake-sort" label="Sort">
            <FormSelect
              id="library-cake-sort"
              onChange={(event) =>
                setSort(event.target.value as LibraryCakeSortId)
              }
              value={sort}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormField htmlFor="library-cake-category" label="Category">
            <FormSelect
              id="library-cake-category"
              onChange={(event) =>
                setCategory(event.target.value as LibraryCakeCategoryFilter)
              }
              value={category}
            >
              <option value="all">All categories</option>
              {LIBRARY_CAKE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {cakeCategoryLabel(value)}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormField htmlFor="library-cake-status" label="Status">
            <FormSelect
              id="library-cake-status"
              onChange={(event) =>
                setStatus(event.target.value as LibraryCakeStatusFilter)
              }
              value={status}
            >
              <option value="all">All statuses</option>
              {LIBRARY_CAKE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {cakeStatusLabel(value)}
                </option>
              ))}
            </FormSelect>
          </FormField>
        </div>
      </div>

      {cakes.length === 0 ? (
        <EmptyState
          description="Build the reusable Cake Library to offer in catalogues."
          title="No cakes yet"
        />
      ) : visible.length === 0 ? (
        <EmptyState
          description="Try a different search or filter. Sort does not hide cakes."
          title="No matching cakes"
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((cake) => (
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
