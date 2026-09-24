import Link from "next/link";
import {
  formatCatalogueVoucherHeadline,
  summarizeCatalogueVoucherRules,
} from "@/engines/vouchers/catalogue-voucher";
import type { CatalogueVoucherRecord } from "@/types/catalogue-voucher";

export function CatalogueOfferCard({
  voucher,
}: {
  voucher: CatalogueVoucherRecord;
}) {
  const details = summarizeCatalogueVoucherRules(voucher);
  return (
    <article className="border-fog rounded-[10px] border bg-white px-5 py-5">
      <p className="text-signal text-[11px] font-medium tracking-[0.16em] uppercase">
        Offer
      </p>
      <h2 className="font-display text-ink mt-2 text-2xl tracking-tight">
        {formatCatalogueVoucherHeadline(voucher)}
      </h2>
      <p className="text-skyline mt-1 text-sm">{voucher.code}</p>
      {details.length > 0 ? (
        <ul className="text-ink mt-3 space-y-1 text-sm leading-relaxed">
          {details.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="text-skyline mt-3 text-sm">
          Available on qualifying cake orders.
        </p>
      )}
      <p className="mt-4">
        <Link
          className="text-ink hover:text-skyline text-sm font-medium"
          href="/browse"
        >
          Browse cakes →
        </Link>
      </p>
    </article>
  );
}
