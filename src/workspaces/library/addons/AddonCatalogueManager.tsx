"use client";

import { useActionState } from "react";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import { createAddonCatalogueItemAction, saveAddonCatalogueItemAction } from "@/workspaces/library/addons/actions";
import type { AddonAssignment, AddonCollection, ComplimentaryCatalogItem, PaidAddonCatalogItem } from "@/workspaces/library/addons/types";
import { classifyAddonCollection, getAddonCollectionBusinessRange, partitionAddonCollections } from "@/workspaces/library/addons/collection-dates.mjs";

type Item = ComplimentaryCatalogItem | PaidAddonCatalogItem;
type CatalogueKind = "complimentary" | "paid";
function assignmentFor(item: Item, collectionId: string): AddonAssignment | undefined { return item.assignments.find((assignment) => assignment.collectionId === collectionId); }
function itemSummary(kind: CatalogueKind, item: Item, collections: AddonCollection[]): string {
  const ids = new Set(collections.map((collection) => collection.id));
  const available = item.assignments.filter((assignment) => ids.has(assignment.collectionId) && assignment.isAvailable).length;
  const selectable = item.assignments.filter((assignment) => ids.has(assignment.collectionId) && assignment.isAvailable && assignment.customerSelectable).length;
  if (kind === "paid" && "unitPrice" in item) return "RM " + item.unitPrice.toFixed(2) + " · max " + item.maxQuantity + "/order · " + available + " collection" + (available === 1 ? "" : "s") + " available";
  const defaults = item.assignments.filter((assignment) => ids.has(assignment.collectionId) && assignment.isDefault).length;
  return available + " collection" + (available === 1 ? "" : "s") + " available · " + selectable + " customer-selectable · " + defaults + " default" + (defaults === 1 ? "" : "s");
}
function dateRange(collection: AddonCollection): string {
  const range = getAddonCollectionBusinessRange(collection);
  return range ? range.startDate + " – " + range.endDate : "Schedule needs review";
}
function historicalSummary(kind: CatalogueKind, assignment: AddonAssignment): string {
  const parts = [assignment.isAvailable ? "Available" : "Unavailable", assignment.customerSelectable ? "customer-selectable" : "not customer-selectable"];
  if (kind === "complimentary") { if (assignment.isDefault) parts.push("default"); parts.push("quantity " + (assignment.defaultQuantity ?? 1)); }
  parts.push("sort " + assignment.sortOrder);
  if (assignment.availableFrom || assignment.availableUntil) parts.push("season " + (assignment.availableFrom ?? "any start") + " to " + (assignment.availableUntil ?? "no end"));
  return parts.join(" · ");
}
function ItemEditor({kind,item,collections}:{kind:CatalogueKind;item?:Item;collections:AddonCollection[]}) {
  const action = item ? saveAddonCatalogueItemAction : createAddonCatalogueItemAction;
  const [state,formAction,pending] = useActionState(action,libraryActionInitialState);
  const paid=kind==="paid";
  const paidItem=item&&"unitPrice" in item?item:undefined;
  const orderedItem=item&&"sortOrder" in item?item:undefined;
  return <form action={formAction} className="border-fog bg-mist space-y-5 rounded-xl border p-5">
    <input name="kind" type="hidden" value={kind}/><input name="id" type="hidden" value={item?.id??""}/>
    <input name="collection_ids" type="hidden" value={collections.map((collection)=>collection.id).join(",")}/>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium">Item name<input className="border-fog min-h-11 rounded-md border bg-white px-3" defaultValue={item?.name??""} maxLength={120} name="name" required/></label>
      <label className="grid gap-1 text-sm font-medium">Item code<input className="border-fog min-h-11 rounded-md border bg-white px-3" defaultValue={item?.code??""} maxLength={64} name="code" pattern="[a-z0-9]+(_[a-z0-9]+)*" required/></label>
      {paid?<>
        <label className="grid gap-1 text-sm font-medium">Unit price (RM)<input className="border-fog min-h-11 rounded-md border bg-white px-3" defaultValue={paidItem?.unitPrice??"0.00"} min="0" name="unit_price" required step="0.01" type="number"/></label>
        <label className="grid gap-1 text-sm font-medium">Financial shorthand<input className="border-fog min-h-11 rounded-md border bg-white px-3" defaultValue={paidItem?.financialShorthand??""} maxLength={20} name="financial_shorthand" required/></label>
        <label className="grid gap-1 text-sm font-medium">Maximum quantity per order<input className="border-fog min-h-11 rounded-md border bg-white px-3" defaultValue={paidItem?.maxQuantity??1} min="1" name="max_quantity" required type="number"/></label>
      </>:null}
      <label className="grid gap-1 text-sm font-medium">Catalogue sort order<input className="border-fog min-h-11 rounded-md border bg-white px-3" defaultValue={orderedItem?.sortOrder??0} name="sort_order" type="number"/></label>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input defaultChecked={item?.isActive??true} name="is_active" type="checkbox"/>Active in the catalogue</label>
    </div>
    <fieldset className="space-y-3"><legend className="text-ink font-semibold">Current and upcoming collections</legend>
      {collections.length?collections.map((collection)=>{
        const assignment=item?assignmentFor(item,collection.id):undefined;
        return <div className="border-fog grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-2 xl:grid-cols-4" key={collection.id}>
          <div className="md:col-span-2 xl:col-span-4"><p className="text-ink font-medium">{collection.name}</p><p className="text-skyline text-xs">{collection.status} · {dateRange(collection)}</p></div>
          <label className="flex items-center gap-2 text-sm"><input defaultChecked={assignment?.isAvailable??false} name={"available_"+collection.id} type="checkbox"/>Available in this collection</label>
          <label className="flex items-center gap-2 text-sm"><input defaultChecked={assignment?.customerSelectable??false} name={"selectable_"+collection.id} type="checkbox"/>Customers can select it</label>
          {!paid?<label className="flex items-center gap-2 text-sm"><input defaultChecked={assignment?.isDefault??false} name={"default_"+collection.id} type="checkbox"/>Include by default</label>:null}
          <label className="grid gap-1 text-xs">{paid?"Collection sort":"Default quantity per eligible cake"}<input className="border-fog min-h-10 rounded-md border px-2 text-sm" defaultValue={paid?assignment?.sortOrder??0:assignment?.defaultQuantity??1} min="0" name={(paid?"sort_":"quantity_")+collection.id} type="number"/></label>
          {!paid?<label className="grid gap-1 text-xs">Collection sort<input className="border-fog min-h-10 rounded-md border px-2 text-sm" defaultValue={assignment?.sortOrder??0} name={"sort_"+collection.id} type="number"/></label>:null}
          <label className="grid gap-1 text-xs">Available from (inclusive)<input className="border-fog min-h-10 rounded-md border px-2 text-sm" defaultValue={assignment?.availableFrom??""} name={"from_"+collection.id} type="date"/></label>
          <label className="grid gap-1 text-xs">Available through (inclusive)<input className="border-fog min-h-10 rounded-md border px-2 text-sm" defaultValue={assignment?.availableUntil??""} name={"until_"+collection.id} type="date"/></label>
        </div>;
      }):<p className="text-skyline text-sm">No current or upcoming collections are available for configuration.</p>}
    </fieldset>
    {state.error?<p className="text-danger text-sm" role="alert">{state.error}</p>:state.success?<p aria-live="polite" className="text-signal text-sm">{state.success}</p>:null}
    <button className="bg-ink text-mist hover:bg-skyline min-h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-60" disabled={pending} type="submit">{pending?"Saving…":item?"Save changes":"Create item"}</button>
  </form>;
}
function HistoricalAssignments({kind,items,collections}:{kind:CatalogueKind;items:Item[];collections:AddonCollection[]}) {
  const rows=items.flatMap((item)=>collections.flatMap((collection)=>{const assignment=assignmentFor(item,collection.id);return assignment?[{item,collection,assignment}]:[];}));
  if(!rows.length)return null;
  return <details className="border-fog rounded-xl border bg-white"><summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><span>Past collection settings <span className="text-skyline font-normal">({rows.length}, read-only)</span></span><span aria-hidden="true" className="text-skyline">Expand / collapse</span></summary><div className="border-fog grid gap-4 border-t p-4">
    {rows.map(({item,collection,assignment})=><article className="border-fog rounded-lg border bg-mist p-4" key={item.id+":"+collection.id}><h4 className="text-ink font-semibold">{item.name}</h4><p className="text-skyline mt-1 text-sm">{collection.name} · {dateRange(collection)}</p><p className="mt-2 text-sm">{historicalSummary(kind,assignment)}</p></article>)}
  </div></details>;
}
function UnscheduledCollections({kind,items,collections,businessToday}:{kind:CatalogueKind;items:Item[];collections:AddonCollection[];businessToday:string}) {
  if (!collections.length) return null;
  const rows=items.flatMap((item)=>collections.flatMap((collection)=>{
    const assignment=assignmentFor(item,collection.id);
    return assignment?[{item,collection,assignment}]:[];
  }));
  return <section aria-label="Collections needing schedule review" className="border-danger rounded-xl border bg-white p-4">
    <h4 className="text-danger font-semibold">Collection schedule needs review</h4>
    <p className="text-skyline mt-1 text-sm">These collections cannot be safely dated, so their settings are read-only until the schedule is resolved. Existing assignments are preserved.</p>
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
      {collections.map((collection)=>{
        const classification=classifyAddonCollection(collection,businessToday);
        return <li key={collection.id}><span className="font-medium">{collection.name}</span> — {classification.reason}</li>;
      })}
    </ul>
    {rows.length?<div className="mt-4 space-y-3"><h5 className="font-medium">Preserved read-only settings</h5>
      {rows.map(({item,collection,assignment})=><article className="border-fog rounded-lg border bg-mist p-4" key={item.id+":"+collection.id}><h6 className="font-semibold">{item.name}</h6><p className="text-skyline mt-1 text-sm">{collection.name} · {dateRange(collection)}</p><p className="mt-2 text-sm">{historicalSummary(kind,assignment)}</p></article>)}
    </div>:null}
  </section>;
}
function CatalogueSection({kind,items,editableCollections,historicalCollections,ambiguousCollections,businessToday}:{kind:CatalogueKind;items:Item[];editableCollections:AddonCollection[];historicalCollections:AddonCollection[];ambiguousCollections:AddonCollection[];businessToday:string}) {
  const complimentary=kind==="complimentary";
  const headingId=complimentary?"complimentary-items-heading":"paid-addons-heading";
  const title=complimentary?"Complimentary items":"Paid add-ons";
  const description=complimentary?"Manage complimentary catalogue items separately from paid add-ons.":"Prices on new orders are read and snapshotted by the database.";
  return <section className="space-y-5" aria-labelledby={headingId}><div><h3 className="text-ink text-2xl font-semibold" id={headingId}>{title}</h3><p className="text-skyline mt-1 text-sm">{description}</p></div>
    <details className="border-signal rounded-xl border bg-white shadow-sm"><summary className="text-ink flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><span aria-hidden="true" className="text-xl">＋</span><span>Create new {complimentary?"complimentary item":"paid add-on"}</span></summary><div className="border-signal border-t p-4"><ItemEditor collections={editableCollections} kind={kind}/></div></details>
    <p className="text-skyline text-xs">Current and upcoming collections are editable. Each item is collapsed until opened.</p>
    {items.map((item)=><details className="border-fog rounded-xl border bg-white shadow-sm" key={item.id}><summary className="text-ink flex min-h-16 cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"><span className="font-semibold">{item.name}</span><span className={item.isActive?"rounded-full bg-signal/10 px-2.5 py-1 text-xs font-semibold text-signal":"rounded-full bg-fog px-2.5 py-1 text-xs font-semibold text-skyline"}>{item.isActive?"Active":"Inactive"}</span></span><span className="text-skyline w-full text-sm sm:w-auto sm:text-right">{itemSummary(kind,item,editableCollections)}</span><span aria-hidden="true" className="text-skyline text-sm">Expand / collapse</span></summary><div className="border-fog border-t p-4"><ItemEditor collections={editableCollections} item={item} kind={kind}/></div></details>)}
    {items.length===0?<p className="text-skyline rounded-lg border border-dashed p-4 text-sm">No {complimentary?"complimentary items":"paid add-ons"} have been created.</p>:null}
    <HistoricalAssignments collections={historicalCollections} items={items} kind={kind}/>
    <UnscheduledCollections businessToday={businessToday} collections={ambiguousCollections} items={items} kind={kind}/>
  </section>;
}
export function AddonCatalogueManager({collections,complimentary,paid,businessToday}:{collections:AddonCollection[];complimentary:ComplimentaryCatalogItem[];paid:PaidAddonCatalogItem[];businessToday:string}) {
  const sections=partitionAddonCollections(collections,businessToday);
  return <div className="space-y-10"><CatalogueSection ambiguousCollections={sections.ambiguous} businessToday={businessToday} editableCollections={sections.editable} historicalCollections={sections.historical} items={complimentary} kind="complimentary"/><CatalogueSection ambiguousCollections={sections.ambiguous} businessToday={businessToday} editableCollections={sections.editable} historicalCollections={sections.historical} items={paid} kind="paid"/></div>;
}
