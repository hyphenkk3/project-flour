"use client";

import { useActionState, useState, useTransition } from "react";
import {
  FormActions,
  FormCheckbox,
  FormError,
  FormField,
  FormInput,
  FormSubmitButton,
  FormTextarea,
} from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { sortFaqItems, type StorefrontFaqRecord } from "@/engines/storefront/faq";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import {
  createStorefrontFaqItemAction,
  moveStorefrontFaqItemAction,
  setStorefrontFaqItemActiveAction,
  updateStorefrontFaqItemAction,
} from "@/workspaces/library/customer-qa/actions";

const ghostButtonClass =
  "border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium transition disabled:opacity-60";

type CustomerQaManagerProps = {
  items: StorefrontFaqRecord[];
  canManage: boolean;
};

export function CustomerQaManager({ items, canManage }: CustomerQaManagerProps) {
  const rows = sortFaqItems(items);
  const [createState, createAction, createPending] = useActionState(
    createStorefrontFaqItemAction,
    libraryActionInitialState,
  );
  const [rowError, setRowError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [editActive, setEditActive] = useState(true);

  function run(action: () => Promise<{ error: string | null }>) {
    setRowError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setRowError(result.error);
        return;
      }
      setEditingId(null);
    });
  }

  return (
    <div className="space-y-6">
      {canManage ? (
        <form
          action={createAction}
          className="border-fog space-y-3 rounded-xl border bg-white p-4 sm:p-5"
        >
          <FormField htmlFor="new-faq-question" label="Question">
            <FormInput id="new-faq-question" name="question" required />
          </FormField>
          <FormField htmlFor="new-faq-answer" label="Answer">
            <FormTextarea id="new-faq-answer" name="answer" required rows={6} />
          </FormField>
          <FormCheckbox defaultChecked label="Active" name="is_active" />
          <FormError message={createState.error} />
          <FormActions>
            <FormSubmitButton pending={createPending}>Add question</FormSubmitButton>
          </FormActions>
        </form>
      ) : null}

      <FormError message={rowError} />

      {rows.length === 0 ? (
        <p className="text-skyline text-sm">No Customer Q&A items yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((item, index) => {
            const isEditing = editingId === item.id;
            return (
              <li
                className="border-fog rounded-xl border bg-white p-4"
                key={item.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex max-w-xl flex-col gap-3">
                        <FormField
                          htmlFor={`edit-question-${item.id}`}
                          label="Question"
                        >
                          <FormInput
                            id={`edit-question-${item.id}`}
                            onChange={(event) =>
                              setEditQuestion(event.target.value)
                            }
                            value={editQuestion}
                          />
                        </FormField>
                        <FormField
                          htmlFor={`edit-answer-${item.id}`}
                          label="Answer"
                        >
                          <FormTextarea
                            id={`edit-answer-${item.id}`}
                            onChange={(event) =>
                              setEditAnswer(event.target.value)
                            }
                            rows={8}
                            value={editAnswer}
                          />
                        </FormField>
                        <FormCheckbox
                          checked={editActive}
                          label="Active"
                          onChange={(event) =>
                            setEditActive(event.target.checked)
                          }
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium transition disabled:opacity-60"
                            disabled={pending}
                            onClick={() => {
                              const formData = new FormData();
                              formData.set("question", editQuestion);
                              formData.set("answer", editAnswer);
                              if (editActive) formData.set("is_active", "on");
                              run(() =>
                                updateStorefrontFaqItemAction(
                                  item.id,
                                  libraryActionInitialState,
                                  formData,
                                ),
                              );
                            }}
                            type="button"
                          >
                            Save
                          </button>
                          <button
                            className={ghostButtonClass}
                            onClick={() => setEditingId(null)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-skyline text-sm font-medium">
                            {item.displayOrder}
                          </p>
                          <p className="text-ink font-medium">{item.question}</p>
                          <StatusBadge
                            label={item.isActive ? "Active" : "Inactive"}
                            tone={item.isActive ? "success" : "warning"}
                          />
                        </div>
                        <p className="text-skyline mt-2 whitespace-pre-line text-sm leading-relaxed">
                          {item.answer}
                        </p>
                      </>
                    )}
                  </div>
                  {canManage && !isEditing ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={ghostButtonClass}
                        disabled={pending || index === 0}
                        onClick={() =>
                          run(() => moveStorefrontFaqItemAction(item.id, "up"))
                        }
                        type="button"
                      >
                        Move up
                      </button>
                      <button
                        className={ghostButtonClass}
                        disabled={pending || index === rows.length - 1}
                        onClick={() =>
                          run(() => moveStorefrontFaqItemAction(item.id, "down"))
                        }
                        type="button"
                      >
                        Move down
                      </button>
                      <button
                        className={ghostButtonClass}
                        disabled={pending}
                        onClick={() => {
                          setEditQuestion(item.question);
                          setEditAnswer(item.answer);
                          setEditActive(item.isActive);
                          setEditingId(item.id);
                        }}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className={ghostButtonClass}
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            setStorefrontFaqItemActiveAction(
                              item.id,
                              !item.isActive,
                            ),
                          )
                        }
                        type="button"
                      >
                        {item.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
