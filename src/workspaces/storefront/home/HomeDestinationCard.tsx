import Link from "next/link";
import type { ReactNode } from "react";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";

export type HomeDestinationTone = "cream" | "sage" | "linen";

const TONE_CLASS: Record<
  HomeDestinationTone,
  { surface: string; fade: string }
> = {
  cream: {
    surface: "bg-[#f3dfd0]",
    fade: "from-[#f3dfd0]",
  },
  sage: {
    surface: "bg-[#dce5db]",
    fade: "from-[#dce5db]",
  },
  linen: {
    surface: "bg-[#e7e4d4]",
    fade: "from-[#e7e4d4]",
  },
};

type HomeDestinationCardProps = {
  title: string;
  description: string;
  extra?: ReactNode;
  actionLabel: string;
  href: string;
  tone: HomeDestinationTone;
  imageUrl?: string | null;
  imageAlt?: string | null;
};

export function HomeDestinationCard({
  title,
  description,
  extra,
  actionLabel,
  href,
  tone,
  imageUrl = null,
  imageAlt = null,
}: HomeDestinationCardProps) {
  const colors = TONE_CLASS[tone];
  const hasImage = Boolean(imageUrl);

  return (
    <article className="h-[10.25rem] md:h-[11.75rem]">
      <Link
        className={`group border-ink/10 relative flex h-full overflow-hidden rounded-[10px] border shadow-[0_1px_8px_rgba(28,25,22,0.04)] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/30 ${colors.surface}`}
        href={href}
      >
        {hasImage && imageUrl ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[40%]">
            <CakePhotoImage
              alt={imageAlt || ""}
              sizes="160px"
              src={imageUrl}
            />
            <div
              className={`absolute inset-0 bg-gradient-to-r to-transparent ${colors.fade} from-[18%]`}
            />
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[38%] bg-gradient-to-l from-ink/[0.045] to-transparent" />
        )}

        <div
          className={[
            "relative z-10 flex h-full min-w-0 flex-col justify-between px-4 py-4 sm:px-5 sm:py-[1.15rem]",
            hasImage ? "w-[62%] pr-4" : "w-full",
          ].join(" ")}
        >
          <div className="min-w-0">
            <h3 className="font-display text-ink text-[1.22rem] leading-tight tracking-tight sm:text-[1.35rem]">
              {title}
            </h3>
            <p className="text-skyline mt-1.5 line-clamp-2 text-[13px] leading-relaxed sm:text-sm">
              {description}
            </p>
            {extra}
          </div>
          <span className="text-ink mt-3 flex items-center justify-between gap-3 text-[13px] font-medium sm:text-sm">
            <span className="group-hover:text-skyline truncate transition-colors duration-200">
              {actionLabel}
            </span>
            <span
              aria-hidden="true"
              className="border-ink/15 group-hover:border-ink/30 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[13px] transition-colors duration-200"
            >
              →
            </span>
          </span>
        </div>
      </Link>
    </article>
  );
}
