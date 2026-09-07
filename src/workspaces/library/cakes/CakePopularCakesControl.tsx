"use client";

import { useActionState, useEffect, useState } from "react";
import { FormError } from "@/components/ui/form";
import { POPULAR_CAKES_MAX_SELECTION } from "@/engines/menu/homepage-popular-cakes";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import { updateCakePopularCakesFromLibraryAction } from "@/workspaces/library/cakes/actions";

type CakePopularCakesControlProps = {
  cakeId: string;
  showInPopularCakes: boolean;
  position: number | null;
  canManage: boolean;
};

export function CakePopularCakesControl({
  cakeId,
  showInPopularCakes,
  position,
  canManage,
}: CakePopularCakesControlProps) {
  const [state, formAction, pending] = useActionState(
    updateCakePopularCakesFromLibraryAction,
    libraryActionInitialState,
  );
  const [checked, setChecked] = useState(showInPopularCakes);
  const [orderValue, setOrderValue] = useState(
    position != null ? String(position) : "",
  );

  useEffect(() => {
    setChecked(showInPopularCakes);
    setOrderValue(position != null ? String(position) : "");
  }, [position, showInPopularCakes]);

  useEffect(() => {
    if (state.error) {
      setChecked(showInPopularCakes);
      setOrderValue(position != null ? String(position) : "");
    }
  }, [position, showInPopularCakes, state.error]);

  const statusLabel = showInPopularCakes
    ? `✓ Popular · #${position ?? "—"}`
    : "Not shown";

  if (!canManage) {
    return (
      <p className="text-skyline mt-2 text-xs">
        <span className="text-ink font-medium">Popular Cakes</span>
        <span className="mt-0.5 block">{statusLabel}</span>
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input name="cake_id" type="hidden" value={cakeId} />
      <label className="text-ink flex min-h-11 items-center gap-2 text-sm">
        <input
          checked={checked}
          className="size-4 shrink-0 accent-[var(--color-signal)]"
          disabled={pending}
          name="show_in_popular_cakes"
          onChange={(event) => {
            setChecked(event.target.checked);
            event.currentTarget.form?.requestSubmit();
          }}
          type="checkbox"
          value="on"
        />
        Show in Popular Cakes
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-skyline text-xs">{statusLabel}</p>
        {showInPopularCakes ? (
          <label className="text-skyline flex items-center gap-1.5 text-xs">
            Order
            <input
              className="border-fog text-ink h-9 w-14 rounded-md border bg-white px-2 text-sm tabular-nums outline-none focus:border-signal disabled:opacity-60"
              disabled={pending}
              inputMode="numeric"
              max={POPULAR_CAKES_MAX_SELECTION}
              min={1}
              name="popular_cakes_sort_order"
              onChange={(event) => {
                setOrderValue(event.target.value);
                if (event.target.value.trim()) {
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              step={1}
              type="number"
              value={orderValue}
            />
          </label>
        ) : null}
      </div>
      {pending ? (
        <p className="text-skyline text-xs">Saving…</p>
      ) : (
        <FormError message={state.error} />
      )}
    </form>
  );
}
