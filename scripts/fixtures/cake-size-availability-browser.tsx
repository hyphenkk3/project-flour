/** Local test harness rendering production components against fixture services. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { StorefrontCakeCard } from "@/workspaces/storefront/catalog/StorefrontCakeCard";
import { StorefrontCakeDetailView } from "@/workspaces/storefront/catalog/StorefrontCakeDetailView";
import { CheckoutOrderSummary } from "@/workspaces/storefront/checkout/CheckoutOrderSummary";
import { StorefrontCartShell } from "@/workspaces/storefront/cart/StorefrontCartShell";
import { CakeSizeFields } from "@/workspaces/library/cakes/CakeSizeFields";
import {
  patchPreorderDraft,
  readPreorderDraft,
} from "@/workspaces/storefront/checkout/preorder-draft";
import type { StorefrontCake } from "@/types/storefront";
declare global {
  interface Window {
    fixtureCake: StorefrontCake;
  }
}
function Harness() {
  const [date, setDate] = useState("");
  const [mode, setMode] = useState("detail");
  const cake = window.fixtureCake;
  const draft = readPreorderDraft();
  return (
    <>
      <label>
        Fixture pickup date
        <input
          id="fixture-pickup"
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            patchPreorderDraft({ pickupDate: event.target.value });
          }}
        />
      </label>
      <button onClick={() => setMode("detail")}>Detail fixture</button>
      <button onClick={() => setMode("summary")}>Summary fixture</button>
      <button onClick={() => setMode("admin")}>Admin fixture</button>
      <button onClick={() => setMode("card")}>Card fixture</button>
      {mode === "card" ? (
        <StorefrontCakeCard cake={cake} />
      ) : mode === "detail" ? (
        <StorefrontCakeDetailView
          cake={cake}
          pickupScopePickup={date || null}
        />
      ) : mode === "admin" ? (
        <form>
          <CakeSizeFields
            initialSizes={cake.sizes.map((size) => ({
              ...size,
              label: size.size,
            }))}
          />
        </form>
      ) : (
        <CheckoutOrderSummary
          checkoutPricesBySizeId={{}}
          checkoutChoicePricesReady={true}
          items={draft?.items ?? []}
          cakes={[cake]}
          total={78}
          pickupDate={date || null}
          pickupDateLabel={date || null}
          earliestLabel={null}
          preorderLabel={null}
          offerLabel={null}
          loadingOffer={false}
          unavailableMessage={null}
          catalogueReady={true}
          addingCake={true}
          addSizeByCake={{}}
          onAddSize={() => {}}
          onAddCake={() => {}}
          onToggleAdding={() => {}}
          onChangeSize={() => {}}
          onChangeQuantity={() => {}}
          onRemove={() => {}}
        />
      )}
      {mode === "detail" ? <StorefrontCartShell /> : null}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
