"use client";

import { useActionState, useState, useTransition } from "react";
import { sortCakeCategories } from "@/engines/menu/cake-categories";
import {
  FormActions,
  FormError,
  FormField,
  FormInput,
  FormSubmitButton,
} from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { LibraryCakeCategoryRecord } from "@/types/library-cake";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import {
  createCakeCategoryAction,
  moveCakeCategoryAction,
  renameCakeCategoryAction,
  setCakeCategoryActiveAction,
} from "@/workspaces/library/cakes/category-actions";

const ghostButtonClass =
  "border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium transition disabled:opacity-60";

type CakeCategoryManagerProps = {
  categories: LibraryCakeCategoryRecord[];
  cakeCounts: Record<string, number>;
};

export function CakeCategoryManager({
  categories,
  cakeCounts,
}: CakeCategoryManagerProps) {
  const rows = sortCakeCategories(categories);
  const [createState, createAction, createPending] = useActionState(
    createCakeCategoryAction,
    libraryActionInitialState,
  );
  const [rowError, setRowError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function run(action: () => Promise<{ error: string | null }>) {
    setRowError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setRowError(result.error);
        return;
      }
      setRenamingId(null);
    });
  }

  return (
    <div className="space-y-6">
      <form
        action={createAction}
        className="border-fog space-y-3 rounded-xl border bg-white p-4 sm:p-5"
      >
        <FormField htmlFor="new-category-name" label="Add category">
          <FormInput
            id="new-category-name"
            maxLength={80}
            name="name"
            placeholder="e.g. Wedding"
            required
          />
        </FormField>
        <FormError message={createState.error} />
        <FormActions>
          <FormSubmitButton pending={createPending}>
            Add category
          </FormSubmitButton>
        </FormActions>
      </form>

      <FormError message={rowError} />

      {rows.length === 0 ? (
        <p className="text-skyline text-sm">No categories yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((category, index) => {
            const assigned = cakeCounts[category.id] ?? 0;
            const isRenaming = renamingId === category.id;
            return (
              <li
                className="border-fog rounded-xl border bg-white p-4"
                key={category.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <div className="flex max-w-md flex-col gap-2">
                        <FormField
                          htmlFor={`rename-${category.id}`}
                          label="Rename category"
                        >
                          <FormInput
                            id={`rename-${category.id}`}
                            maxLength={80}
                            onChange={(event) =>
                              setRenameValue(event.target.value)
                            }
                            value={renameValue}
                          />
                        </FormField>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium transition disabled:opacity-60"
                            disabled={pending}
                            onClick={() => {
                              const formData = new FormData();
                              formData.set("name", renameValue);
                              run(() =>
                                renameCakeCategoryAction(
                                  category.id,
                                  libraryActionInitialState,
                                  formData,
                                ),
                              );
                            }}
                            type="button"
                          >
                            Save name
                          </button>
                          <button
                            className={ghostButtonClass}
                            onClick={() => setRenamingId(null)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-ink font-medium">{category.name}</p>
                          <StatusBadge
                            label={category.isActive ? "Active" : "Inactive"}
                            tone={category.isActive ? "success" : "warning"}
                          />
                        </div>
                        <p className="text-skyline mt-1 text-sm">
                          {assigned === 1
                            ? "Assigned to 1 cake"
                            : `Assigned to ${assigned} cakes`}
                        </p>
                      </>
                    )}
                  </div>
                  {isRenaming ? null : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={ghostButtonClass}
                        disabled={pending || index === 0}
                        onClick={() =>
                          run(() => moveCakeCategoryAction(category.id, "up"))
                        }
                        type="button"
                      >
                        Move up
                      </button>
                      <button
                        className={ghostButtonClass}
                        disabled={pending || index === rows.length - 1}
                        onClick={() =>
                          run(() =>
                            moveCakeCategoryAction(category.id, "down"),
                          )
                        }
                        type="button"
                      >
                        Move down
                      </button>
                      <button
                        className={ghostButtonClass}
                        disabled={pending}
                        onClick={() => {
                          setRenameValue(category.name);
                          setRenamingId(category.id);
                        }}
                        type="button"
                      >
                        Rename
                      </button>
                      <button
                        className={ghostButtonClass}
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            setCakeCategoryActiveAction(
                              category.id,
                              !category.isActive,
                            ),
                          )
                        }
                        type="button"
                      >
                        {category.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
