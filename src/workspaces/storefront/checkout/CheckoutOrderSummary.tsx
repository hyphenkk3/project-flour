import type { StorefrontCake } from "@/types/storefront";
import { FormSelect } from "@/components/ui/form";
import { startingPrice, formatRm } from "@/workspaces/storefront/catalog/pricing";
import { draftLinePreorderLabel } from "@/workspaces/storefront/cart/cart-order-summary";
import type { PreorderDraftItem } from "@/workspaces/storefront/checkout/preorder-draft";

type CheckoutOrderSummaryProps = {
  items: PreorderDraftItem[];
  cakes: StorefrontCake[];
  total: number;
  pickupDateLabel: string | null;
  earliestLabel: string | null;
  preorderLabel: string | null;
  offerLabel: string | null;
  loadingOffer: boolean;
  unavailableMessage: string | null;
  catalogueReady: boolean;
  addingCake: boolean;
  addSizeByCake: Record<string, string>;
  onAddSize: (cakeId: string, sizeId: string) => void;
  onAddCake: (cake: StorefrontCake) => void;
  onToggleAdding: (open: boolean) => void;
  onChangeSize: (index: number, sizeId: string) => void;
  onChangeQuantity: (index: number, quantity: number) => void;
  onRemove: (index: number) => void;
};

export function CheckoutOrderSummary({
  items,
  cakes,
  total,
  pickupDateLabel,
  earliestLabel,
  preorderLabel,
  offerLabel,
  loadingOffer,
  unavailableMessage,
  catalogueReady,
  addingCake,
  addSizeByCake,
  onAddSize,
  onAddCake,
  onToggleAdding,
  onChangeSize,
  onChangeQuantity,
  onRemove,
}: CheckoutOrderSummaryProps) {
  return (
    <aside className="lg:sticky lg:top-8">
      <p className="text-signal text-[11px] font-semibold tracking-[0.18em] uppercase">
        Whitebird
      </p>
      <h2 className="font-display text-ink mt-2 text-3xl tracking-tight">
        Your Order
      </h2>
      {pickupDateLabel ? (
        <p className="text-skyline mt-2 text-sm">Collection · {pickupDateLabel}</p>
      ) : null}

      <div className="mt-6">
        {loadingOffer ? (
          <p className="text-skyline text-sm" aria-live="polite">
            Loading cakes for that date…
          </p>
        ) : unavailableMessage ? (
          <div role="status">
            <p className="text-ink text-sm leading-relaxed">{unavailableMessage}</p>
            <p className="text-skyline mt-2 text-sm leading-relaxed">
              Please choose a date in a published catalogue.
            </p>
          </div>
        ) : (
          <>
            {offerLabel ? (
              <p className="text-skyline mb-4 text-sm">{offerLabel}</p>
            ) : null}
            {items.length === 0 ? (
              <p className="text-skyline text-sm">No cakes added yet.</p>
            ) : (
              <ul className="divide-fog divide-y">
                {items.map((item, index) => {
                  const cake = cakes.find((entry) => entry.id === item.cakeId);
                  const preorder = draftLinePreorderLabel(item);
                  const sizeSelectId = `size-${index}`;
                  const qtyId = `qty-${index}`;
                  return (
                    <li className="py-4" key={`${item.cakeId}-${item.sizeId}-${index}`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-ink font-medium">{item.cakeName}</p>
                        <button
                          className="text-skyline hover:text-ink shrink-0 text-sm font-medium"
                          onClick={() => onRemove(index)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor={sizeSelectId}>
                          Size
                        </label>
                        <div className="w-[9.75rem] shrink-0">
                        <FormSelect
                          id={sizeSelectId}
                          onChange={(event) =>
                            onChangeSize(index, event.target.value)
                          }
                          value={item.sizeId}
                        >
                          {(cake?.sizes ?? []).map((size) => (
                            <option key={size.id} value={size.id}>
                              {size.size} — {formatRm(size.price)}
                            </option>
                          ))}
                        </FormSelect>
                        </div>
                        <label className="sr-only" htmlFor={qtyId}>
                          Quantity
                        </label>
                        <input
                          className="border-fog text-ink h-12 w-16 rounded-lg border bg-white px-2 text-center text-sm tabular-nums outline-none focus:border-signal"
                          id={qtyId}
                          min={1}
                          onChange={(event) =>
                            onChangeQuantity(
                              index,
                              Math.max(1, Number(event.target.value) || 1),
                            )
                          }
                          step={1}
                          type="number"
                          value={item.quantity}
                        />
                        <p className="text-ink ml-auto text-sm font-medium tabular-nums">
                          {formatRm(item.unitPrice * item.quantity)}
                        </p>
                      </div>
                      {preorder ? (
                        <p className="text-skyline mt-2 text-[11px] font-semibold tracking-[0.14em] uppercase">
                          {preorder}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            {addingCake ? (
              cakes.length > 0 ? (
                <div className="border-fog mt-4 space-y-2 border-t pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-ink text-sm font-medium">
                      Available cakes for this date
                    </p>
                    <button
                      className="text-skyline text-sm font-medium"
                      onClick={() => onToggleAdding(false)}
                      type="button"
                    >
                      Close
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {cakes.map((cake) => (
                      <li
                        className="flex flex-wrap items-center gap-2"
                        key={cake.id}
                      >
                        <span className="text-ink min-w-0 flex-1 text-sm">
                          {cake.name}
                          {startingPrice(cake) != null
                            ? ` · from ${formatRm(startingPrice(cake) ?? 0)}`
                            : ""}
                        </span>
                        <div className="w-36 shrink-0">
                        <FormSelect
                          aria-label={`Size for ${cake.name}`}
                          onChange={(event) =>
                            onAddSize(cake.id, event.target.value)
                          }
                          value={addSizeByCake[cake.id] ?? cake.sizes[0]?.id ?? ""}
                        >
                          {cake.sizes.map((size) => (
                            <option key={size.id} value={size.id}>
                              {size.size}
                            </option>
                          ))}
                        </FormSelect>
                        </div>
                        <button
                          className="text-signal text-sm font-medium"
                          onClick={() => onAddCake(cake)}
                          type="button"
                        >
                          Add
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-skyline mt-4 text-sm">
                  No cakes are offered for this date.
                </p>
              )
            ) : catalogueReady ? (
              <button
                className="text-signal mt-4 text-sm font-medium"
                onClick={() => onToggleAdding(true)}
                type="button"
              >
                + Add another cake
              </button>
            ) : null}
          </>
        )}
      </div>

      <dl className="border-fog mt-6 space-y-3 border-t pt-5 text-sm">
        <div>
          <dt className="text-skyline text-[11px] font-semibold tracking-[0.14em] uppercase">
            Collection date
          </dt>
          <dd className="text-ink mt-1 font-medium">
            {pickupDateLabel ?? "Not selected yet"}
          </dd>
        </div>
        <div>
          <dt className="text-skyline text-[11px] font-semibold tracking-[0.14em] uppercase">
            Earliest collection
          </dt>
          <dd className="text-ink mt-1 font-medium">{earliestLabel ?? "—"}</dd>
        </div>
        {preorderLabel ? (
          <div>
            <dt className="text-skyline text-[11px] font-semibold tracking-[0.14em] uppercase">
              Preorder
            </dt>
            <dd className="text-ink mt-1 text-[11px] font-semibold tracking-[0.14em] uppercase">
              {preorderLabel}
            </dd>
          </div>
        ) : null}
        {!unavailableMessage && pickupDateLabel ? (
          <div className="flex items-baseline justify-between gap-3 pt-1">
            <dt className="text-ink text-sm">Total</dt>
            <dd className="text-ink font-display text-xl tracking-tight tabular-nums">
              {formatRm(total)}
            </dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}
