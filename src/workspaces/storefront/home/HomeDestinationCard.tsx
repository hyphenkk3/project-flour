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
  /** Tighter title/body rhythm so a short summary can sit above the CTA. */
  dense?: boolean;
  /** Fresh Picks needs room for availability lines without clipping the CTA. */
  tall?: boolean;
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
  dense = false,
  tall = false,
}: HomeDestinationCardProps) {
  const cardClass = `relative flex h-full flex-col overflow-hidden rounded-[14px] border px-[18px] pt-[18px] pb-4 md:rounded-[10px] md:px-5 md:py-4 md:shadow-[0_1px_8px_rgba(28,25,22,0.045)] ${TONE_CLASS[tone]} ${
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
        <span
          className={`bg-ink/[0.05] text-ink/70 flex h-8 w-8 items-center justify-center rounded-full ${
            dense ? "mb-1.5" : "mb-2.5"
          }`}
        >
          {icon}
        </span>
        <h3 className="font-display text-ink text-[1.2rem] leading-tight tracking-tight sm:text-[1.32rem]">
          {title}
        </h3>
        <p
          className={`line-clamp-2 text-[13px] ${
            dense ? "mt-0.5 leading-snug" : "mt-1 leading-relaxed"
          } ${unavailable ? "text-skyline/80" : "text-skyline"}`}
        >
          {description}
        </p>
      </div>
      {extra}
      {extra ? (
        <div
          aria-hidden="true"
          className="max-md:min-h-2 max-md:flex-1 md:hidden"
        />
      ) : null}
      <span
        className={`mt-auto inline-flex min-h-11 w-full items-center justify-between rounded-full px-3.5 text-[13px] font-medium md:min-h-0 md:py-2 md:text-[12px] ${ctaClass}`}
      >
        {actionLabel}
        <span aria-hidden="true">→</span>
      </span>
    </>
  );

  return (
    <article className={`${tall ? "h-[14.5rem]" : "h-[11.25rem]"} md:h-[12rem]`}>
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
