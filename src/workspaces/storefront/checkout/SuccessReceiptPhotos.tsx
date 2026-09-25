"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import { SaveOrderDetailsButton } from "@/workspaces/storefront/checkout/SaveOrderDetailsButton";
import { loadGuestReceiptPhotosAction } from "@/workspaces/storefront/checkout/receipt-photos-action";
import type {
  GuestPreorderReceipt,
  GuestPreorderReceiptItem,
} from "@/workspaces/storefront/checkout/receipt";
import {
  logCheckoutClient,
  readCheckoutSubmitTiming,
} from "@/lib/perf/dev-only-client";

const PhotoItemsContext = createContext<GuestPreorderReceiptItem[] | null>(
  null,
);

export function SuccessReceiptPhotoController({
  orderId,
  receipt,
  children,
}: {
  orderId?: string;
  receipt: GuestPreorderReceipt;
  children: ReactNode;
}) {
  const [items, setItems] = useState(receipt.items);
  const photosPromise = useRef<Promise<GuestPreorderReceipt> | null>(null);

  useEffect(() => {
    if (!orderId || receipt.items.length === 0) return;
    const started = performance.now();
    const base = receipt;
    const pending = loadGuestReceiptPhotosAction(orderId, base.items).then(
      (result) => {
        const nextItems = result.items ?? base.items;
        setItems(nextItems);
        const timing = readCheckoutSubmitTiming();
        logCheckoutClient("CHECKOUT_SUCCESS_PHOTO", {
          correlationId: timing?.correlationId ?? null,
          cake_photos: result.elapsedMs,
          clientWaitMs: Math.round(performance.now() - started),
        });
        return { ...base, items: nextItems };
      },
    );
    photosPromise.current = pending;
  }, [orderId, receipt]);

  async function resolveReceipt(): Promise<GuestPreorderReceipt> {
    if (photosPromise.current) return photosPromise.current;
    return { ...receipt, items };
  }

  return (
    <PhotoItemsContext.Provider value={items}>
      {children}
      <SaveOrderDetailsButton
        receipt={{ ...receipt, items }}
        resolveReceipt={resolveReceipt}
      />
    </PhotoItemsContext.Provider>
  );
}

export function ReceiptPhotoBox({
  item,
}: {
  item: GuestPreorderReceiptItem;
}) {
  const items = useContext(PhotoItemsContext);
  const current = items?.find((row) => row.key === item.key) ?? item;
  return (
    <div className="bg-fog/40 relative h-16 w-16 shrink-0 overflow-hidden rounded-[10px] sm:h-[4.5rem] sm:w-[4.5rem]">
      {current.imageUrl ? (
        <CakePhotoImage
          alt={current.imageAlt ?? current.cakeName}
          sizes="72px"
          src={current.imageUrl}
        />
      ) : null}
    </div>
  );
}
