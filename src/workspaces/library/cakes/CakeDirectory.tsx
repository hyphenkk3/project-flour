"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import { FormField, FormInput, FormSelect } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  formatCakePhotoCoverageLabel,
  resolveCakePhoto,
} from "@/engines/menu/cake-photos";
import {
  DEFAULT_LIBRARY_CAKE_SORT,
  type LibraryCakeSortId,
} from "@/engines/menu/cake-library-list";
import type { LibraryCake, LibraryCakePhoto } from "@/types/library-cake";
import {
  applyLibraryCakeDirectory,
  type LibraryCakeCategoryFilter,
  type LibraryCakePhotoFilter,
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

function asResolvable(photos: LibraryCakePhoto[]) {
  return photos.map((photo) => ({
    id: photo.id,
    url: photo.imageUrl,
    altText: photo.altText,
    sortOrder: photo.sortOrder,
    cakeSizeId: photo.cakeSizeId,
    isDefault: photo.isDefault,
  }));
}

function CakeDirectoryThumb({
  cake,
}: {
  cake: LibraryCake;
}) {
  const photos = asResolvable(cake.photos ?? []);
  const hero = resolveCakePhoto(photos);
  const src = hero?.url?.trim() || "";

  return (
    <div className="bg-fog relative h-14 w-14 shrink-0 overflow-hidden rounded-lg sm:h-16 sm:w-16">
      {src ? (
        <CakePhotoImage
          alt={hero?.altText?.trim() || cake.name}
          sizes="64px"
          src={src}
        />
      ) : (
        <span className="text-skyline flex h-full w-full items-center justify-center">
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              height="14"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
              width="18"
              x="3"
              y="5"
            />
            <circle cx="8.5" cy="9.5" r="1.25" fill="currentColor" />
            <path
              d="M7 16.5 10.2 12l3.1 3.2L16 12.5l4 4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
          <span className="sr-only">No photos</span>
        </span>
      )}
    </div>
  );
}

export function CakeDirectory({ cakes }: CakeDirectoryProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LibraryCakeSortId>(DEFAULT_LIBRARY_CAKE_SORT);
  const [category, setCategory] = useState<LibraryCakeCategoryFilter>("all");
  const [status, setStatus] = useState<LibraryCakeStatusFilter>("all");
  const [photos, setPhotos] = useState<LibraryCakePhotoFilter>("all");

  const visible = useMemo(
    () =>
      applyLibraryCakeDirectory(cakes, {
        query,
        category,
        status,
        photos,
        sort,
      }),
    [cakes, query, category, status, photos, sort],
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <FormField htmlFor="library-cake-photos" label="Photo status">
            <FormSelect
              id="library-cake-photos"
              onChange={(event) =>
                setPhotos(event.target.value as LibraryCakePhotoFilter)
              }
              value={photos}
            >
              <option value="all">All</option>
              <option value="has_photos">Has photos</option>
              <option value="missing_photos">Missing photos</option>
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
          {visible.map((cake) => {
            const coverage = formatCakePhotoCoverageLabel(
              asResolvable(cake.photos ?? []),
              cake.sizes,
            );
            return (
              <li
                className="border-fog rounded-xl border bg-white p-4"
                key={cake.id}
              >
                <div className="flex items-start gap-3">
                  <CakeDirectoryThumb cake={cake} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-ink truncate font-medium">
                          {cake.name}
                        </p>
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
                    <p className="text-skyline mt-2 text-sm">{coverage}</p>
                    <Link
                      className="text-signal hover:text-ink mt-3 inline-flex min-h-11 items-center text-sm font-medium"
                      href={`/library/cakes/${cake.id}`}
                    >
                      Open →
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
