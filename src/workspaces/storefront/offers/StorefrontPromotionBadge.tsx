import type { CataloguePromotionBadge } from "@/engines/vouchers/catalogue-promotion-presentation";

export function StorefrontPromotionBadge({
  badge,
  compact = false,
}: {
  badge: CataloguePromotionBadge;
  compact?: boolean;
}) {
  return (
    <p
      className={
        compact
          ? "text-skyline mt-1 text-[10px] leading-tight tracking-[0.12em] uppercase"
          : "text-skyline mt-1.5 text-[11px] leading-snug tracking-[0.12em] uppercase"
      }
    >
      <span className="block">{badge.eyebrow}</span>
      <span className="text-ink mt-0.5 block font-medium tracking-[0.08em]">
        {badge.detail}
      </span>
    </p>
  );
}
