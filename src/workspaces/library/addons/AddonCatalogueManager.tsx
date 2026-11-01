"use client";

import { useActionState } from "react";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import {
  createAddonCatalogueItemAction,
  saveAddonCatalogueItemAction,
} from "@/workspaces/library/addons/actions";
import type {
  AddonAssignment,
  AddonCollection,
  ComplimentaryCatalogItem,
  PaidAddonCatalogItem,
} from "@/workspaces/library/addons/types";

type Item = ComplimentaryCatalogItem | PaidAddonCatalogItem;

function assignmentFor(item: Item, collectionId: string): AddonAssignment | undefined {
  return item.assignments.find((assignment) => assignment.collectionId === collectionId);
}

function ItemEditor({
  kind,
  item,
  collections,
}: {
  kind: "complimentary" | "paid";
  item?: Item;
  collections: AddonCollection[];
}) {
  const action = item ? saveAddonCatalogueItemAction : createAddonCatalogueItemAction;
  const [state, formAction, pending] = useActionState(action, libraryActionInitialState);
  const paid = kind === "paid";
  const paidItem = item && "unitPrice" in item ? item : undefined;
  const orderedItem = item && "sortOrder" in item ? item : undefined;

  return (
    <form action={formAction} className="border-fog bg-mist space-y-5 rounded-xl border p-5">
      <input name="kind" type="hidden" value={kind} />
      <input name="id" type="hidden" value={item?.id ?? ""} />
      <input name="collection_ids" type="hidden" value={collections.map((collection) => collection.id).join(",")} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          Item name
          <input className="border-fog min-h-11 rounded-md border bg-white px-3" defaultValue={item?.name ?? ""} maxLength={120} name="name" required />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Item code
          <input className="border-fog min-h-11 rounded-md border bg-white px-3" defaultValue={item?.code ?? ""} maxLength={64} name="code" pattern="[a-z0-9]+(_[a-z0-9]+)*" required />
        </label>
        {paid ? (
          <>
            <label className="grid gap-1 text-sm font-medium">
              Unit price (RM)
              <input className="border-fog min-h-11 rounded-md border bg-white px-3" defaultValue={paidItem?.unitPrice ?? "0.00"} min="0" name="unit_price" required step="0.01" type="number" />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Financial shorthand
              <input className="border-fog min-h-11 rounded-md border bg-white px-3" defaultValue={paidItem?.financialShorthand ?? ""} maxLength={20} name="financial_shorthand" required />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Maximum quantity per order
              <input className="border-fog min-h-11 rounded-md border bg-white px-3" defaultValue={paidItem?.maxQuantity ?? 1} min="1" name="max_quantity" required type="number" />
            </label>
          </>
        ) : null}
        <label className="grid gap-1 text-sm font-medium">
          Catalogue sort order
          <input className="border-fog min-h-11 rounded-md border bg-white px-3" defaultValue={orderedItem?.sortOrder ?? 0} name="sort_order" type="number" />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input defaultChecked={item?.isActive ?? true} name="is_active" type="checkbox" />
          Active in the catalogue
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-ink font-semibold">Collection availability and dates</legend>
        {collections.map((collection) => {
          const assignment = item ? assignmentFor(item, collection.id) : undefined;
          return (
            <div className="border-fog grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-2 xl:grid-cols-4" key={collection.id}>
              <div className="md:col-span-2 xl:col-span-4">
                <p className="text-ink font-medium">{collection.name}</p>
                <p className="text-skyline text-xs">{collection.status}</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input defaultChecked={assignment?.isAvailable ?? false} name={`available_${collection.id}`} type="checkbox" />
                Available in this collection
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input defaultChecked={assignment?.customerSelectable ?? false} name={`selectable_${collection.id}`} type="checkbox" />
                Customers can select it
              </label>
              {!paid ? (
                <label className="flex items-center gap-2 text-sm">
                  <input defaultChecked={assignment?.isDefault ?? false} name={`default_${collection.id}`} type="checkbox" />
                  Include by default
                </label>
              ) : null}
              <label className="grid gap-1 text-xs">
                {paid ? "Collection sort" : "Default quantity per eligible cake"}
                <input className="border-fog min-h-10 rounded-md border px-2 text-sm" defaultValue={paid ? assignment?.sortOrder ?? 0 : assignment?.defaultQuantity ?? 1} min="0" name={paid ? `sort_${collection.id}` : `quantity_${collection.id}`} type="number" />
              </label>
              {!paid ? (
                <label className="grid gap-1 text-xs">
                  Collection sort
                  <input className="border-fog min-h-10 rounded-md border px-2 text-sm" defaultValue={assignment?.sortOrder ?? 0} name={`sort_${collection.id}`} type="number" />
                </label>
              ) : null}
              <label className="grid gap-1 text-xs">
                Available from (inclusive)
                <input className="border-fog min-h-10 rounded-md border px-2 text-sm" defaultValue={assignment?.availableFrom ?? ""} name={`from_${collection.id}`} type="date" />
              </label>
              <label className="grid gap-1 text-xs">
                Available through (inclusive)
                <input className="border-fog min-h-10 rounded-md border px-2 text-sm" defaultValue={assignment?.availableUntil ?? ""} name={`until_${collection.id}`} type="date" />
              </label>
            </div>
          );
        })}
      </fieldset>

      {state.error ? <p className="text-danger text-sm" role="alert">{state.error}</p> : state.success ? <p aria-live="polite" className="text-signal text-sm">{state.success}</p> : null}
      <button className="bg-ink text-mist hover:bg-skyline min-h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Saving…" : item ? "Save changes" : "Create item"}
      </button>
    </form>
  );
}

export function AddonCatalogueManager({
  collections,
  complimentary,
  paid,
}: {
  collections: AddonCollection[];
  complimentary: ComplimentaryCatalogItem[];
  paid: PaidAddonCatalogItem[];
}) {
  return (
    <div className="space-y-10">
      <section className="space-y-5" aria-labelledby="complimentary-items-heading">
        <div>
          <h3 className="text-ink text-2xl font-semibold" id="complimentary-items-heading">Complimentary items</h3>
          <p className="text-skyline mt-1 text-sm">Manage complimentary catalogue items separately from paid add-ons.</p>
        </div>
        <ItemEditor collections={collections} kind="complimentary" />
        {complimentary.map((item) => <ItemEditor collections={collections} item={item} key={item.id} kind="complimentary" />)}
      </section>
      <section className="space-y-5" aria-labelledby="paid-addons-heading">
        <div>
          <h3 className="text-ink text-2xl font-semibold" id="paid-addons-heading">Paid add-ons</h3>
          <p className="text-skyline mt-1 text-sm">Prices on new orders are read and snapshotted by the database.</p>
        </div>
        <ItemEditor collections={collections} kind="paid" />
        {paid.map((item) => <ItemEditor collections={collections} item={item} key={item.id} kind="paid" />)}
      </section>
    </div>
  );
}
