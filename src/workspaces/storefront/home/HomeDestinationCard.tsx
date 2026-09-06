import Link from "next/link";
import type { ReactNode } from "react";

export type HomeDestinationTone = "blush" | "sage" | "linen";
export type HomeDestinationCta = "ink" | "soft";

const TONE_CLASS: Record<HomeDestinationTone, string> = {
  blush: "bg-[#EFD8C6]",
  sage: "bg-[#D8D6CC]",
  linen: "bg-[#EBE6D8]",
};

const CTA_CLASS: Record<HomeDestinationCta, string> = {
  ink: "bg-ink text-paper",
  soft: "border-ink/10 bg-[#F6F1E8] text-ink",
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
  /** When true, the card is not a link and must not navigate. */
  unavailable?: boolean;
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
  unavailable = false,
}: HomeDestinationCardProps) {
  const cardClass = `relative flex h-full flex-col overflow-hidden rounded-[10px] border px-4 py-4 shadow-[0_1px_8px_rgba(28,25,22,0.045)] sm:px-5 ${TONE_CLASS[tone]} ${
    unavailable
      ? "border-ink/10 cursor-default"
      : "group border-ink/10 transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/30"
  }`;
  const ctaClass = unavailable
    ? "border-ink/10 bg-[#F6F1E8] text-skyline/70 cursor-default"
    : CTA_CLASS[ctaVariant];

  const body = (
    <>
      <div className="min-w-0">
        <span className="bg-ink/[0.05] text-ink/70 mb-2.5 flex h-8 w-8 items-center justify-center rounded-full">
          {icon}
        </span>
        <h3 className="font-display text-ink text-[1.2rem] leading-tight tracking-tight sm:text-[1.32rem]">
          {title}
        </h3>
        <p
          className={`mt-1 line-clamp-2 text-[13px] leading-relaxed ${
            unavailable ? "text-skyline/80" : "text-skyline"
          }`}
        >
          {description}
        </p>
        {extra}
      </div>
      <span
        className={`mt-auto inline-flex w-full items-center justify-between rounded-full px-3.5 py-2 text-[12px] font-medium ${ctaClass}`}
      >
        {actionLabel}
        <span aria-hidden="true">→</span>
      </span>
    </>
  );

  return (
    <article className="h-[11.25rem] md:h-[12rem]">
      {unavailable ? (
        <div
          aria-disabled="true"
          aria-label={`${title}, currently unavailable`}
          className={cardClass}
          role="group"
        >
          {body}
        </div>
      ) : (
        <Link className={cardClass} href={href}>
          {body}
        </Link>
      )}
    </article>
  );
}
