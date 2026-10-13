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
    fixtureAdded: string | null;
    setFixtureCake: (index: number, initialSizeId: string) => void;
  }
}

function Harness() {
  const [selection, setSelection] = useState({ index: 0, sizeId: "" });
  useEffect(() => {
    window.setFixtureCake = (index, sizeId) => {
      window.fixtureCakeIndex = index;
      window.fixtureInitialSizeId = sizeId;
      window.fixtureDraft = null;
      window.fixtureAdded = null;
      setSelection({ index, sizeId });
    };
  }, []);
  const cake = window.fixtureCakes[selection.index]!;
  return (
    <>
      <main className="p-4">
        Product page remains behind the compact order sheet.
      </main>
      <AddToOrderSheet
        key={`${cake.id}:${selection.sizeId}`}
        cake={cake}
        initialSizeId={selection.sizeId}
        open
        onClose={() => {}}
        onAdded={(result) => {
          window.fixtureAdded = result;
        }}
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
