"use client";

import Link from "next/link";
import {
  formatCataloguePromotionDetail,
  type CataloguePromotionDetail,
} from "@/engines/vouchers/catalogue-promotion-presentation";
import type { CatalogueVoucherRecord } from "@/types/catalogue-voucher";

export type CakeOfferCardVoucher = CatalogueVoucherRecord;

export function CakeOfferCard({
  voucher,
  today,
  selectedSizeLabel = null,
}: {
  voucher: CatalogueVoucherRecord;
  today: string;
  selectedSizeLabel?: string | null;
}) {
  const offer = formatCataloguePromotionDetail(voucher, {
    today,
    selectedSizeLabel,
    orderType: "preorder",
  });
  return <CakeOfferCardView offer={offer} />;
}

export function CakeOfferCardView({
  offer,
}: {
  offer: CataloguePromotionDetail;
}) {
  return (
    <aside className="border-fog rounded-[10px] border bg-white px-4 py-4">
      <p className="text-signal text-[11px] font-medium tracking-[0.16em] uppercase">
        {offer.eyebrow}
      </p>
      <p className="font-display text-ink mt-2 text-2xl tracking-tight">
        {offer.headline}
      </p>
      {offer.sizeLine ? (
        <p className="text-ink mt-1 text-sm">{offer.sizeLine}</p>
      ) : null}
      {offer.sizeNote ? (
        <p className="text-skyline mt-1 text-sm">{offer.sizeNote}</p>
      ) : null}
      <p className="text-skyline mt-2 text-sm tracking-[0.12em] uppercase">
        {offer.code}
      </p>
      <dl className="text-skyline mt-3 grid gap-2 text-sm">
        {offer.orderBy ? (
          <div>
            <dt className="tracking-[0.12em] uppercase">Order by</dt>
            <dd className="text-ink mt-0.5">{offer.orderBy}</dd>
          </div>
        ) : null}
        {offer.fulfilment ? (
          <div>
            <dt className="tracking-[0.12em] uppercase">Fulfilment</dt>
            <dd className="text-ink mt-0.5">{offer.fulfilment}</dd>
          </div>
        ) : null}
        {offer.minimum ? (
          <div>
            <dt className="tracking-[0.12em] uppercase">Minimum</dt>
            <dd className="text-ink mt-0.5">{offer.minimum}</dd>
          </div>
        ) : null}
        {offer.orderType ? (
          <div>
            <dt className="tracking-[0.12em] uppercase">Order type</dt>
            <dd className="text-ink mt-0.5">{offer.orderType}</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-skyline mt-3 text-sm">{offer.autoApplyNote}</p>
      <p className="mt-2">
        <Link
          className="text-ink hover:text-skyline text-sm font-medium"
          href="/offers"
        >
          View offer details →
        </Link>
      </p>
    </aside>
  );
}
