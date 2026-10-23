import { singaporeDateFromIso } from "@/engines/orders/promotions";
import { buildTargetedPromotionBadgeByCakeId } from "@/engines/vouchers/catalogue-promotion-presentation";
import { StorefrontPromotionBadge } from "@/workspaces/storefront/offers/StorefrontPromotionBadge";
import { BrowseVoucherRetryButton } from "@/workspaces/storefront/catalog/BrowseVoucherRetryButton";
import { listPublicCatalogueVouchersForBrowse } from "@/workspaces/vouchers/catalogue-queries";
import type { BrowseStorefrontCake } from "@/workspaces/storefront/catalog/queries";

export function BrowseVoucherFallback() {
  return (
    <p aria-live="polite" className="text-skyline mt-4 text-sm" role="status">
      Checking current offers. Discounts are confirmed at checkout.
    </p>
  );
}

export async function BrowseVoucherPromotions({
  cakes,
  vouchersPromise,
}: {
  cakes: readonly BrowseStorefrontCake[];
  vouchersPromise: ReturnType<typeof listPublicCatalogueVouchersForBrowse>;
}) {
  const result = await vouchersPromise;
  if (!result.ok) {
    return (
      <section
        aria-labelledby="browse-offers-error-heading"
        className="border-fog bg-mist mt-5 rounded-md border p-4"
        role="alert"
      >
        <h2
          className="text-ink text-sm font-semibold"
          id="browse-offers-error-heading"
        >
          Current offer details are temporarily unavailable
        </h2>
        <p className="text-skyline mt-1 text-sm">
          Cake prices are unaffected. Eligible discounts are still checked when
          you place an order. Please retry to view current offer details.
        </p>
        <div className="mt-3">
          <BrowseVoucherRetryButton />
        </div>
      </section>
    );
  }

  const today = singaporeDateFromIso(new Date().toISOString());
  const cakeNames = new Map(cakes.map((cake) => [cake.id, cake.name]));
  const promotions = buildTargetedPromotionBadgeByCakeId(
    result.vouchers,
    today,
    "preorder",
  ).filter(([cakeId]) => cakeNames.has(cakeId));
  if (promotions.length === 0) return null;

  return (
    <section
      aria-labelledby="browse-offers-heading"
      className="border-fog bg-mist mt-5 rounded-md border p-4"
    >
      <h2 className="text-ink text-sm font-semibold" id="browse-offers-heading">
        Current cake offers
      </h2>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {promotions.map(([cakeId, badge]) => (
          <li className="flex flex-wrap items-center gap-2" key={cakeId}>
            <span className="text-ink text-sm">{cakeNames.get(cakeId)}</span>
            <StorefrontPromotionBadge badge={badge} />
          </li>
        ))}
      </ul>
      <p className="text-skyline mt-2 text-xs">
        Eligibility and the final discount are verified at checkout.
      </p>
    </section>
  );
}
