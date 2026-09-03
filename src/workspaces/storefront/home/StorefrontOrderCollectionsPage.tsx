import Link from "next/link";
import {
  SPECIAL_MENU_DESCRIPTION,
  SPECIAL_MENU_HEADING,
  SPECIAL_PERIOD_CAKES_NOTE,
  customerSpecialMenuPeriodLabel,
  monthOverlapsDateRange,
  orderCollectionHeadline,
  orderCollectionPickupCopy,
  sortCustomerCatalogueChoices,
} from "@/engines/menu/customer-browse";
import { businessYearMonth, toBusinessDateKey } from "@/lib/dates";
import {
  StorefrontHomeLink,
  StorefrontStaffSignIn,
} from "@/workspaces/storefront/StorefrontBrand";
import {
  listCustomerSpecialCatalogues,
  listOrderableMonthlyCatalogues,
} from "@/workspaces/storefront/catalog/queries";
import { PreorderInProgressBar } from "@/workspaces/storefront/checkout/PreorderInProgressBar";

export const dynamic = "force-dynamic";

type CollectionChoiceCardProps = {
  title: string;
  description: string;
  note?: string | null;
  href: string;
  cta: string;
};

function CollectionChoiceCard({
  title,
  description,
  note,
  href,
  cta,
}: CollectionChoiceCardProps) {
  return (
    <li className="border-fog rounded-3xl border bg-white px-6 py-6">
      <h3 className="font-display text-ink text-xl tracking-tight sm:text-2xl">
        {title}
      </h3>
      <p className="text-skyline mt-1.5 text-sm">{description}</p>
      {note ? <p className="text-skyline mt-1.5 text-sm">{note}</p> : null}
      <Link
        className="text-ink mt-5 inline-flex min-h-10 items-center text-sm font-medium"
        href={href}
      >
        {cta}
      </Link>
    </li>
  );
}

export async function StorefrontOrderCollectionsPage() {
  const todayYmd = toBusinessDateKey();
  const todayYm = businessYearMonth(todayYmd) ?? todayYmd.slice(0, 7);
  const [catalogues, specials] = await Promise.all([
    listOrderableMonthlyCatalogues(todayYmd),
    listCustomerSpecialCatalogues(todayYmd),
  ]);
  const hasChoices = catalogues.length > 0 || specials.length > 0;
  const choices = sortCustomerCatalogueChoices([
    ...catalogues.map((catalogue) => ({
      kind: "monthly" as const,
      id: catalogue.id,
      displayOrder: catalogue.displayOrder ?? null,
      month: catalogue.month ?? "",
    })),
    ...specials.map((special) => ({
      kind: "special" as const,
      id: special.id,
      displayOrder: special.displayOrder,
    })),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 py-10 sm:px-6">
      <StorefrontHomeLink />
      <h1 className="font-display text-ink mt-8 text-3xl tracking-tight">
        Choose your collection
      </h1>
      <p className="text-skyline mt-3 text-[0.95rem] leading-relaxed">
        Monthly collections and Special Menus for Whole Cake orders. Your
        pickup date still decides which cakes you can order.
      </p>
      <p className="mt-3">
        <Link
          className="text-ink hover:text-skyline text-sm font-medium"
          href="/browse"
        >
          Browse all published cakes →
        </Link>
      </p>

      <PreorderInProgressBar />

      <section aria-labelledby="order-collections-heading" className="mt-8 space-y-3">
        <h2 className="sr-only" id="order-collections-heading">
          Published collections
        </h2>
        {!hasChoices ? (
          <p className="text-skyline text-sm">
            No collections are open for preorder right now. Please check back
            soon.
          </p>
        ) : (
          <ul className="space-y-3">
            {choices.map((choice) => {
              if (choice.kind === "special") {
                const special = specials.find((row) => row.id === choice.id);
                const period = special
                  ? customerSpecialMenuPeriodLabel(
                      special.startDate,
                      special.endDate,
                    )
                  : null;
                return (
                  <CollectionChoiceCard
                    cta="View Special Menu →"
                    description={
                      period ?? SPECIAL_MENU_DESCRIPTION
                    }
                    href={`/order/collection/${choice.id}`}
                    key={choice.id}
                    title={SPECIAL_MENU_HEADING}
                  />
                );
              }
              const specialNote = specials.some((special) =>
                monthOverlapsDateRange(
                  choice.month,
                  special.startDate,
                  special.endDate,
                ),
              )
                ? SPECIAL_PERIOD_CAKES_NOTE
                : null;
              return (
                <CollectionChoiceCard
                  cta="View & order →"
                  description={orderCollectionPickupCopy(choice.month, todayYm)}
                  href={`/order/collection/${choice.id}`}
                  key={choice.id}
                  note={specialNote}
                  title={orderCollectionHeadline(choice.month)}
                />
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-10">
        <StorefrontHomeLink />
      </p>
      <StorefrontStaffSignIn />
    </main>
  );
}
