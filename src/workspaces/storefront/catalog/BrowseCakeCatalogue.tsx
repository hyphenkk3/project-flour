"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { StorefrontCake } from "@/types/storefront";
import {
  EMPTY_BROWSE_FILTERS,
  browseFilterOptionsFromCatalogue,
  countActiveBrowseFilters,
  hasActiveBrowseFilters,
  preorderFilterLabel,
  type BrowseFilterState,
} from "@/workspaces/storefront/catalog/browse-filters";
import {
  BROWSE_SORT_OPTIONS,
  DEFAULT_BROWSE_SORT,
  viewBrowseCatalogue,
  type BrowseSortId,
} from "@/workspaces/storefront/catalog/browse-sort";
import { StorefrontCakeCard } from "@/workspaces/storefront/catalog/StorefrontCakeCard";

type BrowseCake = StorefrontCake & { availabilityNote?: string | null };

type BrowseCakeCatalogueProps = {
  cakes: BrowseCake[];
};

type FilterFieldsProps = {
  filters: BrowseFilterState;
  onChange: (next: BrowseFilterState) => void;
  options: ReturnType<typeof browseFilterOptionsFromCatalogue>;
  categoryId: string;
  sizeId: string;
  priceId: string;
  preorderId: string;
};

function FilterFields({
  filters,
  onChange,
  options,
  categoryId,
  sizeId,
  priceId,
  preorderId,
}: FilterFieldsProps) {
  const selectClass =
    "border-fog text-ink focus:border-ink min-h-11 w-full border-0 border-b bg-transparent py-2 text-sm outline-none";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {options.categories.length > 1 ? (
        <div>
          <label
            className="text-ink text-[11px] font-semibold tracking-[0.14em] uppercase"
            htmlFor={categoryId}
          >
            Category
          </label>
          <select
            className={selectClass}
            id={categoryId}
            onChange={(event) =>
              onChange({
                ...filters,
                category:
                  (event.target.value || "") as BrowseFilterState["category"],
              })
            }
            value={filters.category}
          >
            <option value="">Any</option>
            {options.categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {options.sizes.length > 1 ? (
        <div>
          <label
            className="text-ink text-[11px] font-semibold tracking-[0.14em] uppercase"
            htmlFor={sizeId}
          >
            Size
          </label>
          <select
            className={selectClass}
            id={sizeId}
            onChange={(event) =>
              onChange({ ...filters, size: event.target.value })
            }
            value={filters.size}
          >
            <option value="">Any</option>
            {options.sizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {options.priceRanges.length > 0 ? (
        <div>
          <label
            className="text-ink text-[11px] font-semibold tracking-[0.14em] uppercase"
            htmlFor={priceId}
          >
            Price
          </label>
          <select
            className={selectClass}
            id={priceId}
            onChange={(event) =>
              onChange({ ...filters, priceRangeId: event.target.value })
            }
            value={filters.priceRangeId}
          >
            <option value="">Any</option>
            {options.priceRanges.map((range) => (
              <option key={range.id} value={range.id}>
                {range.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {options.preorderDays.length > 1 ? (
        <div>
          <label
            className="text-ink text-[11px] font-semibold tracking-[0.14em] uppercase"
            htmlFor={preorderId}
          >
            Preorder
          </label>
          <select
            className={selectClass}
            id={preorderId}
            onChange={(event) =>
              onChange({
                ...filters,
                preorderDays: event.target.value
                  ? Number(event.target.value)
                  : null,
              })
            }
            value={filters.preorderDays ?? ""}
          >
            <option value="">Any</option>
            {options.preorderDays.map((days) => (
              <option key={days} value={days}>
                {preorderFilterLabel(days)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

function FilterSheet({
  filters,
  onChange,
  onClear,
  onClose,
  options,
  categoryId,
  sizeId,
  priceId,
  preorderId,
}: FilterFieldsProps & { onClear: () => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const node = dialogRef.current;
    if (!node || node.open) return;
    node.showModal();
  }, []);

  return (
    <dialog
      aria-labelledby={titleId}
      className="border-fog bg-mist text-ink w-full max-w-none rounded-t-2xl border p-0 shadow-lg backdrop:bg-ink/40 open:fixed open:inset-x-0 open:bottom-0 open:mt-auto open:mb-0 md:hidden"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      ref={dialogRef}
    >
      <div className="flex flex-col gap-5 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-ink text-2xl tracking-tight" id={titleId}>
            Filters
          </h2>
          <button
            aria-label="Close filters"
            className="text-skyline hover:text-ink inline-flex min-h-11 min-w-11 items-center justify-center text-sm font-medium"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <FilterFields
          categoryId={categoryId}
          filters={filters}
          onChange={onChange}
          options={options}
          preorderId={preorderId}
          priceId={priceId}
          sizeId={sizeId}
        />
        <div className="flex flex-wrap items-center gap-4">
          {hasActiveBrowseFilters(filters) ? (
            <button
              className="text-skyline hover:text-ink text-sm font-medium"
              onClick={onClear}
              type="button"
            >
              Clear filters
            </button>
          ) : null}
          <button
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-5 text-sm font-medium"
            onClick={onClose}
            type="button"
          >
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function BrowseCakeCatalogue({ cakes }: BrowseCakeCatalogueProps) {
  const searchId = useId();
  const sortId = useId();
  const categoryId = useId();
  const sizeId = useId();
  const priceId = useId();
  const preorderId = useId();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<BrowseFilterState>(EMPTY_BROWSE_FILTERS);
  const [sort, setSort] = useState<BrowseSortId>(DEFAULT_BROWSE_SORT);
  const [sheetOpen, setSheetOpen] = useState(false);
  const options = useMemo(
    () => browseFilterOptionsFromCatalogue(cakes),
    [cakes],
  );
  const visible = useMemo(
    () => viewBrowseCatalogue(cakes, query, filters, options.priceRanges, sort),
    [cakes, query, filters, options.priceRanges, sort],
  );
  const activeCount = countActiveBrowseFilters(filters);
  const hasFilters = hasActiveBrowseFilters(filters);
  const canFilter =
    options.categories.length > 1 ||
    options.sizes.length > 1 ||
    options.priceRanges.length > 0 ||
    options.preorderDays.length > 1;
  const cakeCountLabel = visible.length === 1 ? "1 cake" : `${visible.length} cakes`;

  if (cakes.length === 0) {
    return (
      <p className="text-skyline text-sm">
        No cakes are published to browse right now. Please check back soon.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-8">
        <form
          className="w-full max-w-sm"
          onSubmit={(event) => {
            event.preventDefault();
          }}
          role="search"
        >
          <label
            className="text-ink text-[11px] font-semibold tracking-[0.14em] uppercase"
            htmlFor={searchId}
          >
            Search
          </label>
          <div className="relative mt-2">
            <input
              autoComplete="off"
              autoCorrect="off"
              className="border-fog text-ink placeholder:text-skyline focus:border-ink min-h-11 w-full border-0 border-b bg-transparent py-2 pr-10 text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
              id={searchId}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search cakes..."
              spellCheck={false}
              type="search"
              value={query}
            />
            {query ? (
              <button
                aria-label="Clear search"
                className="text-skyline hover:text-ink absolute top-1/2 right-0 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-lg"
                onClick={() => setQuery("")}
                type="button"
              >
                ×
              </button>
            ) : null}
          </div>
        </form>

        <div className="w-full max-w-[14rem]">
          <label
            className="text-ink text-[11px] font-semibold tracking-[0.14em] uppercase"
            htmlFor={sortId}
          >
            Sort
          </label>
          <select
            className="border-fog text-ink focus:border-ink mt-2 min-h-11 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
            id={sortId}
            onChange={(event) => setSort(event.target.value as BrowseSortId)}
            value={sort}
          >
            {BROWSE_SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canFilter ? (
        <div className="mt-5 flex items-center justify-between gap-4 md:hidden">
          <button
            className="text-ink inline-flex min-h-11 items-center text-sm font-medium"
            onClick={() => setSheetOpen(true)}
            type="button"
          >
            Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
          </button>
          {hasFilters ? (
            <button
              className="text-skyline hover:text-ink text-sm font-medium"
              onClick={() => setFilters(EMPTY_BROWSE_FILTERS)}
              type="button"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      {canFilter ? (
        <div className="mt-6 hidden md:block">
          <FilterFields
            categoryId={categoryId}
            filters={filters}
            onChange={setFilters}
            options={options}
            preorderId={preorderId}
            priceId={priceId}
            sizeId={sizeId}
          />
          {hasFilters ? (
            <button
              className="text-skyline hover:text-ink mt-3 text-sm font-medium"
              onClick={() => setFilters(EMPTY_BROWSE_FILTERS)}
              type="button"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      {sheetOpen ? (
        <FilterSheet
          categoryId={`${categoryId}-sheet`}
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters(EMPTY_BROWSE_FILTERS)}
          onClose={() => setSheetOpen(false)}
          options={options}
          preorderId={`${preorderId}-sheet`}
          priceId={`${priceId}-sheet`}
          sizeId={`${sizeId}-sheet`}
        />
      ) : null}

      <p className="text-skyline mt-6 text-sm">{cakeCountLabel}</p>

      {visible.length === 0 ? (
        <p className="text-skyline mt-4 text-sm">
          No cakes found. Try adjusting your search or filters.
        </p>
      ) : (
        <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((cake) => (
            <li className="h-full" key={cake.id}>
              <StorefrontCakeCard
                availabilityNote={cake.availabilityNote}
                cake={cake}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
