import Link from "next/link";
import type { ReactNode } from "react";

export type HomeDestinationTone = "blush" | "sage" | "linen";
export type HomeDestinationCta = "ink" | "soft";

const TONE_CLASS: Record<HomeDestinationTone, string> = {
  blush: "bg-[#f3dfd0]",
  sage: "bg-[#dce5db]",
  linen: "bg-[#e7e4d4]",
};

const CTA_CLASS: Record<HomeDestinationCta, string> = {
  ink: "bg-ink text-paper",
  soft: "border-ink/10 bg-paper/80 text-ink",
};

type HomeDestinationCardProps = {
  title: string;
  description: string;
  extra?: ReactNode;
  actionLabel: string;
  href: string;
  tone: HomeDestinationTone;
  icon: ReactNode;
  ctaVariant?: HomeDestinationCta;
};

export function HomeDestinationCard({
  title,
  description,
  extra,
  actionLabel,
  href,
  tone,
  icon,
  ctaVariant = "soft",
}: HomeDestinationCardProps) {
  return (
    <article className="h-[11.25rem] md:h-[12rem]">
      <Link
        className={`group border-ink/10 relative flex h-full flex-col overflow-hidden rounded-[10px] border px-4 py-4 shadow-[0_1px_8px_rgba(28,25,22,0.045)] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/30 sm:px-5 ${TONE_CLASS[tone]}`}
        href={href}
      >
        <div className="min-w-0">
          <span className="bg-ink/[0.05] text-ink/70 mb-2.5 flex h-8 w-8 items-center justify-center rounded-full">
            {icon}
          </span>
          <h3 className="font-display text-ink text-[1.2rem] leading-tight tracking-tight sm:text-[1.32rem]">
            {title}
          </h3>
          <p className="text-skyline mt-1 line-clamp-2 text-[13px] leading-relaxed">
            {description}
          </p>
          {extra}
        </div>
        <span
          className={`mt-auto inline-flex w-full items-center justify-between rounded-full px-3.5 py-2 text-[12px] font-medium ${CTA_CLASS[ctaVariant]}`}
        >
          {actionLabel}
          <span aria-hidden="true">→</span>
        </span>
      </Link>
    </article>
  );
}
