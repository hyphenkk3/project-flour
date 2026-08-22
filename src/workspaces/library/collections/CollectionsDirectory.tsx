"use client";

import { useEffect, useState, useTransition, type DragEvent } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PAST_MENU_LABEL } from "@/engines/menu/customer-browse";
import {
  catalogueDateLine,
  catalogueDisplayTitle,
  cataloguePurposeLabel,
  catalogueSupportingLine,
  isPublishedSpecialWebsiteOverride,
  reorderCatalogueIds,
} from "@/workspaces/library/collections/catalogue";
import { CatalogueArchiveButton } from "@/workspaces/library/collections/CatalogueArchiveButton";
import { CatalogueRestoreButton } from "@/workspaces/library/collections/CatalogueRestoreButton";
import { reorderCataloguesAction } from "@/workspaces/library/collections/actions";
import { dropIndexAfterRemoval } from "@/workspaces/library/collections/membership";
import type { LibraryCollection } from "@/workspaces/library/collections/queries";
import {
  collectionStatusLabel,
  libraryStatusTone,
} from "@/workspaces/library/labels";

export type CollectionDirectoryItem = LibraryCollection & {
  cakeCount: number;
  isCurrentStorefront: boolean;
  isPastMenu?: boolean;
};

type CollectionsDirectoryProps = {
  collections: CollectionDirectoryItem[];
  variant?: "active" | "archived";
  canManage?: boolean;
};

export function CollectionsDirectory({
  collections,
  variant = "active",
  canManage = false,
}: CollectionsDirectoryProps) {
  const archivedView = variant === "archived";
  const [items, setItems] = useState(collections);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [insertBefore, setInsertBefore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setItems(collections);
  }, [collections]);

  if (items.length === 0) {
    return (
      <EmptyState
        description={
          archivedView
            ? "Archived catalogues will appear here. Restore one to use it again."
            : "Create a catalogue, then add existing cakes from the Master Library. Catalogues do not copy cakes."
        }
        title={archivedView ? "No archived catalogues" : "No catalogues yet"}
      />
    );
  }

  function persist(next: CollectionDirectoryItem[]) {
    const currentIds = items.map((item) => item.id);
    const nextIds = next.map((item) => item.id);
    if (nextIds.every((id, index) => id === currentIds[index])) return;
    setItems(next);
    startTransition(async () => {
      const result = await reorderCataloguesAction(nextIds);
      if (result.error) {
        setError(result.error);
        setItems(collections);
      }
    });
  }

  function handleDrop() {
    if (draggedId == null || insertBefore == null) {
      clearDrag();
      return;
    }
    const fromIndex = items.findIndex((item) => item.id === draggedId);
    const targetIndex = dropIndexAfterRemoval(fromIndex, insertBefore);
    const nextIds = reorderCatalogueIds(
      items.map((item) => item.id),
      draggedId,
      targetIndex,
    );
    const byId = new Map(items.map((item) => [item.id, item]));
    persist(nextIds.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])));
    clearDrag();
  }

  function clearDrag() {
    setDraggedId(null);
    setInsertBefore(null);
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm font-medium text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      <ul
        className="divide-fog border-fog divide-y rounded-xl border bg-white"
        onDragEnd={clearDrag}
        onDrop={(event) => {
          event.preventDefault();
          handleDrop();
        }}
      >
        {items.map((catalogue, index) => {
          const supporting = catalogueSupportingLine(catalogue);
          const dateLine = catalogueDateLine(catalogue);
          const showDropBefore =
            draggedId != null &&
            insertBefore === index &&
            draggedId !== catalogue.id;
          return (
            <li
              className="list-none"
              key={catalogue.id}
              onDragOver={(event) => {
                if (draggedId == null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const rect = (
                  event.currentTarget as HTMLLIElement
                ).getBoundingClientRect();
                const before =
                  event.clientY < rect.top + rect.height / 2
                    ? index
                    : index + 1;
                setInsertBefore(before);
              }}
            >
              {showDropBefore ? <DropIndicator /> : null}
              <div
                className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${
                  draggedId === catalogue.id ? "opacity-60" : ""
                }`}
              >
                <div className="flex min-w-0 gap-3">
                  {archivedView ? null : (
                  <button
                    aria-label={`Drag to reorder ${catalogueDisplayTitle(catalogue)}`}
                    className="border-fog text-skyline hover:border-skyline mt-0.5 inline-flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded-lg border bg-white active:cursor-grabbing"
                    draggable
                    onDragEnd={clearDrag}
                    onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", catalogue.id);
                      setError(null);
                      setDraggedId(catalogue.id);
                    }}
                    type="button"
                  >
                    <DragHandleIcon />
                  </button>
                  )}
                  <div className="min-w-0">
                    <p className="text-ink font-medium">
                      {catalogueDisplayTitle(catalogue)}
                    </p>
                    {supporting ? (
                      <p className="text-skyline mt-1 text-sm">{supporting}</p>
                    ) : null}
                    {dateLine ? (
                      <p className="text-skyline mt-1 text-sm">{dateLine}</p>
                    ) : null}
                    <p className="text-skyline mt-1 text-sm">
                      {catalogue.cakeCount === 1
                        ? "1 cake"
                        : `${catalogue.cakeCount} cakes`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge
                    label={collectionStatusLabel(catalogue.status)}
                    tone={libraryStatusTone(catalogue.status)}
                  />
                  {catalogue.isPastMenu ? (
                    <StatusBadge label={PAST_MENU_LABEL} tone="neutral" />
                  ) : null}
                  {catalogue.showInPastMenu ? (
                    <StatusBadge label="Browse Menu" tone="info" />
                  ) : null}
                  <StatusBadge
                    label={cataloguePurposeLabel(catalogue.purpose)}
                    tone="neutral"
                  />
                  {isPublishedSpecialWebsiteOverride(catalogue) ? (
                    <StatusBadge label="Website Override" tone="info" />
                  ) : null}
                  {catalogue.isCurrentStorefront ? (
                    <StatusBadge label="Website Catalogue" tone="info" />
                  ) : null}
                  {archivedView ? (
                    <CatalogueRestoreButton
                      collectionId={catalogue.id}
                      compact
                    />
                  ) : (
                    <>
                      {canManage ? (
                        <>
                          <Link
                            className="text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium"
                            href={`/library/collections/${catalogue.id}/edit`}
                          >
                            Edit
                          </Link>
                          {catalogue.status === "draft" ? (
                            <CatalogueArchiveButton
                              collectionId={catalogue.id}
                              compact
                            />
                          ) : null}
                          {catalogue.purpose === "monthly" ? (
                            <Link
                              className="text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium"
                              href={`/library/collections/new?copyFrom=${catalogue.id}`}
                            >
                              Copy catalogue
                            </Link>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  )}
                  <Link
                    className="text-signal hover:text-ink inline-flex min-h-11 items-center text-sm font-medium"
                    href={`/library/collections/${catalogue.id}`}
                  >
                    Open →
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
        {draggedId != null && insertBefore === items.length ? (
          <li className="list-none px-4 py-2">
            <DropIndicator />
          </li>
        ) : null}
      </ul>
    </div>
  );
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
