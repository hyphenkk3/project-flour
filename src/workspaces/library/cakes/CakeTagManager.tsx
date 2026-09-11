"use client";

import { useActionState, useState, useTransition } from "react";
import { sortCakeTags } from "@/engines/menu/cake-tags";
import {
  FormActions,
  FormError,
  FormField,
  FormInput,
  FormSubmitButton,
} from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { LibraryCakeTagRecord } from "@/types/library-cake";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import {
  createCakeTagAction,
  moveCakeTagAction,
  renameCakeTagAction,
  setCakeTagActiveAction,
} from "@/workspaces/library/cakes/tag-actions";

const ghostButtonClass =
  "border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium transition disabled:opacity-60";

type CakeTagManagerProps = {
  tags: LibraryCakeTagRecord[];
  cakeCounts: Record<string, number>;
};

export function CakeTagManager({ tags, cakeCounts }: CakeTagManagerProps) {
  const rows = sortCakeTags(tags);
  const [createState, createAction, createPending] = useActionState(
    createCakeTagAction,
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
        <FormField htmlFor="new-tag-name" label="Add tag">
          <FormInput
            id="new-tag-name"
            maxLength={80}
            name="name"
            placeholder="e.g. Weekend"
            required
          />
        </FormField>
        <FormError message={createState.error} />
        <FormActions>
          <FormSubmitButton pending={createPending}>Add tag</FormSubmitButton>
        </FormActions>
      </form>

      <FormError message={rowError} />

      {rows.length === 0 ? (
        <p className="text-skyline text-sm">No tags yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((tag, index) => {
            const assigned = cakeCounts[tag.id] ?? 0;
            const isRenaming = renamingId === tag.id;
            return (
              <li
                className="border-fog rounded-xl border bg-white p-4"
                key={tag.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <div className="flex max-w-md flex-col gap-2">
                        <FormField htmlFor={`rename-${tag.id}`} label="Rename tag">
                          <FormInput
                            id={`rename-${tag.id}`}
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
                                renameCakeTagAction(
                                  tag.id,
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
                          <p className="text-ink font-medium">{tag.name}</p>
                          <StatusBadge
                            label={tag.isActive ? "Active" : "Inactive"}
                            tone={tag.isActive ? "success" : "warning"}
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
                          run(() => moveCakeTagAction(tag.id, "up"))
                        }
                        type="button"
                      >
                        Move up
                      </button>
                      <button
                        className={ghostButtonClass}
                        disabled={pending || index === rows.length - 1}
                        onClick={() =>
                          run(() => moveCakeTagAction(tag.id, "down"))
                        }
                        type="button"
                      >
                        Move down
                      </button>
                      <button
                        className={ghostButtonClass}
                        disabled={pending}
                        onClick={() => {
                          setRenameValue(tag.name);
                          setRenamingId(tag.id);
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
                            setCakeTagActiveAction(tag.id, !tag.isActive),
                          )
                        }
                        type="button"
                      >
                        {tag.isActive ? "Deactivate" : "Reactivate"}
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
