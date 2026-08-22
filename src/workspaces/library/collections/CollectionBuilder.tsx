"use client";

import { useMemo, useState, useTransition, type DragEvent } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  FormError,
  FormField,
  FormInput,
  FormSelect,
} from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { LibraryCake, LibraryCakeStatus } from "@/types/library-cake";
import {
  applyLibraryCakeDirectory,
  type LibraryCakeCategoryFilter,
  type LibraryCakeStatusFilter,
} from "@/workspaces/library/cakes/directory-view";
import {
  addCakeToCollectionAction,
  moveCollectionCakeAction,
  removeCakeFromCollectionAction,
  reorderCollectionCakesAction,
  toggleCollectionCakeAvailableAction,
} from "@/workspaces/library/collections/actions";
import {
  COLLECTION_BULK_SORT_IDS,
  cakesNotInCollection,
  collectionBulkSortLabel,
  collectionCakeStorefrontEligibility,
  dropIndexAfterRemoval,
  isStorefrontLibraryStatus,
  isVisibleOnCustomerStorefront,
  moveCollectionMembershipTo,
  sortCollectionMembership,
  storefrontVisibilityReason,
  type CollectionBulkSortId,
} from "@/workspaces/library/collections/membership";
import type {
  CollectionCakeRow,
  LibraryCollection,
} from "@/workspaces/library/collections/queries";
import {
  LIBRARY_CAKE_CATEGORIES,
  LIBRARY_CAKE_STATUSES,
  cakeCategoryLabel,
  cakeStatusLabel,
  formatCakeSizePrices,
  libraryStatusTone,
} from "@/workspaces/library/labels";

const ghostButtonClass =
  "border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium transition disabled:opacity-60";
const inkButtonClass =
  "bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium transition disabled:opacity-60";

type CollectionBuilderProps = {
  collection: LibraryCollection;
  members: CollectionCakeRow[];
  libraryCakes: LibraryCake[];
  isWebsiteCatalogue: boolean;
};

export function CollectionBuilder({
  collection,
  members,
  libraryCakes,
  isWebsiteCatalogue,
}: CollectionBuilderProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LibraryCakeStatusFilter>("all");
  const [category, setCategory] = useState<LibraryCakeCategoryFilter>("all");
  const [removing, setRemoving] = useState<CollectionCakeRow | null>(null);
  const [bulkSort, setBulkSort] = useState<CollectionBulkSortId>("current");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [insertBefore, setInsertBefore] = useState<number | null>(null);
  const locked = collection.status === "archived";

  const addable = useMemo(() => {
    return applyLibraryCakeDirectory(
      cakesNotInCollection(libraryCakes, members),
      { query, category, status, sort: "name_asc" },
    );
  }, [libraryCakes, members, query, category, status]);

  function run(action: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
      }
    });
  }

  function persistOrder(nextIds: string[]) {
    const currentIds = members.map((member) => member.id);
    if (
      nextIds.length === currentIds.length &&
      nextIds.every((id, index) => id === currentIds[index])
    ) {
      return;
    }
    run(() => reorderCollectionCakesAction(collection.id, nextIds));
  }

  function handleBulkSort() {
    const next = sortCollectionMembership(
      members,
      members.map((member) => member.cake),
      bulkSort,
    );
    persistOrder(next.map((member) => member.id));
  }

  function handleDrop() {
    if (draggedId == null || insertBefore == null) {
      clearDrag();
      return;
    }
    const fromIndex = members.findIndex((member) => member.id === draggedId);
    const targetIndex = dropIndexAfterRemoval(fromIndex, insertBefore);
    const next = moveCollectionMembershipTo(members, draggedId, targetIndex);
    clearDrag();
    persistOrder(next.map((member) => member.id));
  }

  function clearDrag() {
    setDraggedId(null);
    setInsertBefore(null);
  }

  function insertionForCard(
    index: number,
    clientY: number,
    top: number,
    height: number,
  ) {
    const before = clientY < top + height / 2 ? index : index + 1;
    setInsertBefore(before);
  }

  return (
    <div className="space-y-8">
      {error ? <FormError message={error} /> : null}
      {locked ? (
        <p className="text-skyline text-sm">
          This catalogue is archived. Restore it to add, remove, or reorder
          cakes.
        </p>
      ) : null}

      <section className="space-y-3">
        <div>
          <h3 className="text-ink text-sm font-semibold">
            Cakes in this catalogue
          </h3>
          <p className="text-skyline mt-1 text-sm">
            Library status and catalogue availability are separate. Offered
            cakes still need Active or Seasonal Library status, at least one
            size, and to belong to the current website catalogue before they
            appear on the website. Drag cakes to set this catalogue’s order, or
            use Sort catalogue.
          </p>
        </div>

        {members.length > 0 && !locked ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <FormField
              className="sm:min-w-0 sm:flex-1"
              htmlFor="collection-bulk-sort"
              label="Sort catalogue"
            >
              <FormSelect
                id="collection-bulk-sort"
                onChange={(event) =>
                  setBulkSort(event.target.value as CollectionBulkSortId)
                }
                value={bulkSort}
              >
                {COLLECTION_BULK_SORT_IDS.map((value) => (
                  <option key={value} value={value}>
                    {collectionBulkSortLabel(value)}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <button
              className={inkButtonClass}
              disabled={pending || bulkSort === "current"}
              onClick={handleBulkSort}
              type="button"
            >
              Sort catalogue
            </button>
          </div>
        ) : null}

        {members.length === 0 ? (
          <EmptyState
            compact
            description="Add an existing Library cake below. Cakes are not added automatically."
            title="No cakes in this catalogue"
          />
        ) : (
          <ul
            className="space-y-3"
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setInsertBefore(null);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleDrop();
            }}
          >
            {members.map((member, index) => (
              <CollectionMemberCard
                collectionStatus={collection.status}
                disabled={pending || locked}
                dragging={draggedId === member.id}
                index={index}
                isWebsiteCatalogue={isWebsiteCatalogue}
                key={member.id}
                member={member}
                onDragEnd={clearDrag}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const rect = event.currentTarget.getBoundingClientRect();
                  insertionForCard(index, event.clientY, rect.top, rect.height);
                }}
                onDragStart={() => setDraggedId(member.id)}
                onMoveDown={() =>
                  run(() =>
                    moveCollectionCakeAction(collection.id, member.id, 1),
                  )
                }
                onMoveUp={() =>
                  run(() =>
                    moveCollectionCakeAction(collection.id, member.id, -1),
                  )
                }
                onRemove={() => setRemoving(member)}
                onToggleAvailable={(available) =>
                  run(() =>
                    toggleCollectionCakeAvailableAction(
                      collection.id,
                      member.id,
                      available,
                    ),
                  )
                }
                showDropBefore={
                  draggedId != null &&
                  insertBefore === index &&
                  draggedId !== member.id
                }
                total={members.length}
              />
            ))}
            {draggedId != null && insertBefore === members.length ? (
              <li
                aria-hidden
                className="list-none"
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setInsertBefore(members.length);
                }}
              >
                <DropIndicator />
              </li>
            ) : null}
          </ul>
        )}
      </section>

      {locked ? null : (
      <section className="space-y-3">
        <div>
          <h3 className="text-ink text-sm font-semibold">Add from Library</h3>
          <p className="text-skyline mt-1 text-sm">
            Search the Master Cake Library. Adding a cake is an explicit
            merchandising choice and does not change its Library status.
          </p>
        </div>

        <div className="space-y-3">
          <FormInput
            aria-label="Search Library cakes"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or category"
            value={query}
          />
          <FormField htmlFor="collection-add-status" label="Library status">
            <FormSelect
              id="collection-add-status"
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
          <FormField htmlFor="collection-add-category" label="Category">
            <FormSelect
              id="collection-add-category"
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
        </div>

        {addable.length === 0 ? (
          <EmptyState
            compact
            description={
              libraryCakes.length === members.length
                ? "Every Library cake is already in this catalogue."
                : "Try a different search or filter."
            }
            title="No matching Library cakes"
          />
        ) : (
          <ul className="divide-fog border-fog divide-y rounded-xl border bg-white">
            {addable.map((cake) => (
              <li
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                key={cake.id}
              >
                <div className="min-w-0">
                  <p className="text-ink font-medium">{cake.name}</p>
                  <p className="text-skyline mt-1 text-sm">
                    {cakeCategoryLabel(cake.category)} ·{" "}
                    {formatCakeSizePrices(cake.sizes)}
                  </p>
                  <p className="text-skyline mt-1 text-sm">
                    {libraryAddHint(cake.status, cake.sizes.length)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge
                    label={cakeStatusLabel(cake.status)}
                    tone={libraryStatusTone(cake.status)}
                  />
                  <button
                    className={inkButtonClass}
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        addCakeToCollectionAction(collection.id, cake.id),
                      )
                    }
                    type="button"
                  >
                    Add
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      <ConfirmDialog
        confirmLabel="Remove"
        description={
          removing
            ? `${removing.cake.name} stays in the Cake Library. It will no longer be offered in this catalogue.`
            : undefined
        }
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          const membershipId = removing.id;
          setRemoving(null);
          run(() =>
            removeCakeFromCollectionAction(collection.id, membershipId),
          );
        }}
        open={removing !== null}
        title="Remove from catalogue?"
        tone="danger"
      />
    </div>
  );
}

function libraryAddHint(status: LibraryCakeStatus, sizeCount: number): string {
  if (!isStorefrontLibraryStatus(status)) {
    return "Can be added now, but will not appear on the website until Library status is Active or Seasonal.";
  }
  if (sizeCount === 0) {
    return "Can be added now, but will not appear on the website until this cake has a size.";
  }
  return "Eligible to appear on the website once offered in the current website catalogue.";
}

function DropIndicator() {
  return (
    <div
      aria-hidden
      className="bg-signal h-0.5 w-full rounded-full"
      data-drop-indicator="true"
    />
  );
}

type CollectionMemberCardProps = {
  member: CollectionCakeRow;
  collectionStatus: string;
  isWebsiteCatalogue: boolean;
  index: number;
  total: number;
  disabled: boolean;
  dragging: boolean;
  showDropBefore: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleAvailable: (available: boolean) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
};

function CollectionMemberCard({
  member,
  collectionStatus,
  isWebsiteCatalogue,
  index,
  total,
  disabled,
  dragging,
  showDropBefore,
  onMoveUp,
  onMoveDown,
  onToggleAvailable,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
}: CollectionMemberCardProps) {
  const eligibility = collectionCakeStorefrontEligibility({
    collectionStatus,
    isCurrentStorefront: isWebsiteCatalogue,
    available: member.available,
    cakeStatus: member.cake.status,
    sizeCount: member.cake.sizes.length,
  });
  const visibility = storefrontVisibilityReason(eligibility);

  return (
    <li className="list-none" onDragOver={onDragOver}>
      {showDropBefore ? <DropIndicator /> : null}
      <div
        className={`border-fog rounded-xl border bg-white p-4 ${
          dragging ? "opacity-60" : ""
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <button
              aria-label={`Drag to reorder ${member.cake.name}`}
              className="border-fog text-skyline hover:border-skyline mt-0.5 inline-flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded-lg border bg-white active:cursor-grabbing"
              disabled={disabled}
              draggable
              onDragEnd={onDragEnd}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", member.id);
                onDragStart();
              }}
              type="button"
            >
              <DragHandleIcon />
            </button>
            <div className="min-w-0">
              <p className="text-ink font-medium">{member.cake.name}</p>
              <p className="text-skyline mt-1 text-sm">
                {cakeCategoryLabel(member.cake.category)} ·{" "}
                {formatCakeSizePrices(member.cake.sizes)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge
                  label={`Library: ${cakeStatusLabel(member.cake.status)}`}
                  tone={libraryStatusTone(member.cake.status)}
                />
                <StatusBadge
                  label={member.available ? "Offered" : "Not offered"}
                  tone={member.available ? "success" : "neutral"}
                />
                <StatusBadge
                  label={visibility}
                  tone={
                    isVisibleOnCustomerStorefront(eligibility)
                      ? "info"
                      : "warning"
                  }
                />
              </div>
              <Link
                className="text-signal hover:text-ink mt-3 inline-flex min-h-11 items-center text-sm font-medium"
                href={`/library/cakes/${member.cake.id}`}
              >
                Open in Cake Library →
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2">
              <button
                aria-label={`Move ${member.cake.name} up`}
                className={ghostButtonClass}
                disabled={disabled || index === 0}
                onClick={onMoveUp}
                type="button"
              >
                Up
              </button>
              <button
                aria-label={`Move ${member.cake.name} down`}
                className={ghostButtonClass}
                disabled={disabled || index === total - 1}
                onClick={onMoveDown}
                type="button"
              >
                Down
              </button>
            </div>
            <button
              className={ghostButtonClass}
              disabled={disabled}
              onClick={() => onToggleAvailable(!member.available)}
              type="button"
            >
              {member.available ? "Stop offering" : "Offer in catalogue"}
            </button>
            <button
              className="border-status-danger/30 text-status-danger hover:bg-status-danger-soft inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium transition disabled:opacity-60"
              disabled={disabled}
              onClick={onRemove}
              type="button"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function DragHandleIcon() {
  return (
    <svg aria-hidden className="size-5" fill="currentColor" viewBox="0 0 20 20">
      <circle cx="7" cy="5" r="1.25" />
      <circle cx="13" cy="5" r="1.25" />
      <circle cx="7" cy="10" r="1.25" />
      <circle cx="13" cy="10" r="1.25" />
      <circle cx="7" cy="15" r="1.25" />
      <circle cx="13" cy="15" r="1.25" />
    </svg>
  );
}
