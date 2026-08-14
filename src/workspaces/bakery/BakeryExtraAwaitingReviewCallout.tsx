import Link from "next/link";
import { bakeryExtraProposalsAwaitingReviewLabel } from "@/engines/extra/availability";

type BakeryExtraAwaitingReviewCalloutProps = {
  count: number;
};

/**
 * Compact Production heads-up when EXTRA proposals await Bakery review.
 * Hidden when count === 0. Links to /bakery/extra.
 */
export function BakeryExtraAwaitingReviewCallout({
  count,
}: BakeryExtraAwaitingReviewCalloutProps) {
  if (count <= 0) return null;

  return (
    <p className="mt-3 text-sm">
      <Link
        className="text-status-warning hover:text-status-warning/80 font-semibold underline-offset-2 hover:underline"
        href="/bakery/extra"
      >
        {bakeryExtraProposalsAwaitingReviewLabel(count)}
      </Link>
    </p>
  );
}
