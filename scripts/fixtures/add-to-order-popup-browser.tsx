import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AddToOrderSheet } from "@/workspaces/storefront/cart/AddToOrderSheet";
import type { StorefrontCake } from "@/types/storefront";

declare global {
  interface Window {
    fixtureCakes: StorefrontCake[];
    fixtureCakeIndex: number;
    fixtureInitialSizeId: string;
    fixtureDraft: { items: Array<Record<string, unknown>> } | null;
    fixturePickupDate: string | null;
    fixturePickupScope: {
      from: string;
      to: string;
      pickup: string | null;
    } | null;
    fixtureValidationCalls: Array<{
      items: unknown;
      pickupDate: string | null;
    }>;
    fixtureAdded: string | null;
    setFixtureCake: (
      index: number,
      initialSizeId: string,
      pickupScope?: { from: string; to: string; pickup: string | null } | null,
    ) => void;
  }
}

function Harness() {
  const [selection, setSelection] = useState({
    index: 0,
    sizeId: "",
    revision: 0,
    pickupScope: null as Window["fixturePickupScope"],
  });
  useEffect(() => {
    window.setFixtureCake = (index, sizeId, pickupScope = null) => {
      window.fixtureCakeIndex = index;
      window.fixtureInitialSizeId = sizeId;
      window.fixturePickupScope = pickupScope;
      window.fixtureDraft = null;
      window.fixtureAdded = null;
      setSelection((previous) => ({
        index,
        sizeId,
        pickupScope,
        revision: previous.revision + 1,
      }));
    };
  }, []);
  const cake = window.fixtureCakes[selection.index]!;
  return (
    <>
      <main
        className="p-4"
        data-fixture-cake={cake.id}
        data-fixture-size={selection.sizeId}
        data-fixture-scope={selection.pickupScope?.from ?? "none"}
      >
        Product page remains behind the compact order sheet.
      </main>
      <AddToOrderSheet
        key={`${cake.id}:${selection.sizeId}:${selection.revision}`}
        cake={cake}
        initialSizeId={selection.sizeId}
        open
        onClose={() => {}}
        onAdded={(result) => {
          window.fixtureAdded = result;
        }}
        pickupScope={selection.pickupScope}
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
