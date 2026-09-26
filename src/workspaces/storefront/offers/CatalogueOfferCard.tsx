import Link from "next/link";
import {
  formatCataloguePromotionDetail,
  isCatalogueVoucherCakeTargeted,
  listCataloguePromotionOfferCakes,
} from "@/engines/vouchers/catalogue-promotion-presentation";
import type { CatalogueVoucherRecord } from "@/types/catalogue-voucher";

export function CatalogueOfferCard({
  voucher,
  today,
}: {
  voucher: CatalogueVoucherRecord;
  today: string;
}) {
  const offer = formatCataloguePromotionDetail(voucher, {
    today,
    orderType: "preorder",
  });
  const cakes = listCataloguePromotionOfferCakes(voucher);
  const targeted = isCatalogueVoucherCakeTargeted(voucher);

  return (
    <article className="border-fog rounded-[10px] border bg-white px-5 py-5">
      <p className="text-signal text-[11px] font-medium tracking-[0.16em] uppercase">
        {offer.eyebrow}
      </p>
      <h2 className="font-display text-ink mt-2 text-2xl tracking-tight">
        {offer.headline}
        {targeted ? " selected cakes" : ""}
      </h2>
      <p className="text-skyline mt-1 text-sm tracking-[0.12em] uppercase">
        {voucher.code}
      </p>
      {offer.sizeLine ? (
        <p className="text-ink mt-2 text-sm">{offer.sizeLine}</p>
      ) : null}
      {cakes && cakes.length > 0 ? (
        <ul className="mt-4 grid gap-3">
          {cakes.map((cake) => (
            <li key={cake.cakeId}>
              <p className="font-display text-ink text-lg tracking-tight">
                {cake.name}
              </p>
              <p className="text-skyline mt-0.5 text-sm">{cake.sizeDetail}</p>
              <p className="mt-1">
                <Link
                  className="text-ink hover:text-skyline text-sm font-medium"
                  href={cake.href}
                >
                  View cake →
                </Link>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-skyline mt-3 text-sm">
          Available on qualifying cake orders.
        </p>
      )}
      <dl className="text-skyline mt-4 grid gap-2 text-sm">
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
      {!targeted ? (
        <p className="mt-4">
          <Link
            className="text-ink hover:text-skyline text-sm font-medium"
            href="/browse"
          >
            Browse cakes →
          </Link>
        </p>
      ) : null}
    </article>
  );
}
