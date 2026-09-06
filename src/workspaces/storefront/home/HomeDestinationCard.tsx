import Link from "next/link";
import type { ReactNode } from "react";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";

export type HomeDestinationTone = "blush" | "sage" | "linen";

const TONE_CLASS: Record<
  HomeDestinationTone,
  { surface: string; fade: string }
> = {
  blush: {
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
  icon: ReactNode;
  ctaVariant?: "solid" | "text";
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
  icon,
  ctaVariant = "text",
  imageUrl = null,
  imageAlt = null,
}: HomeDestinationCardProps) {
  const colors = TONE_CLASS[tone];
  const hasImage = Boolean(imageUrl);

  return (
    <article className="h-[10.5rem] md:h-[11.75rem]">
      <Link
        className={`group border-ink/10 relative flex h-full overflow-hidden rounded-[10px] border shadow-[0_1px_10px_rgba(28,25,22,0.05)] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/30 ${colors.surface}`}
        href={href}
      >
        {hasImage && imageUrl ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[36%] opacity-80 [&_img]:object-[70%_center]">
            <CakePhotoImage
              alt={imageAlt || ""}
              sizes="160px"
              src={imageUrl}
            />
            <div
              className={`absolute inset-0 bg-gradient-to-r to-transparent ${colors.fade} from-[18%]`}
            />
          </div>
        ) : null}

        <div
          className={[
            "relative z-10 flex h-full min-w-0 flex-col justify-between px-4 py-4 sm:px-5",
            hasImage ? "w-[68%] pr-3" : "w-full",
          ].join(" ")}
        >
          <div className="min-w-0">
            <span className="bg-ink/[0.07] text-ink/75 mb-2.5 flex h-8 w-8 items-center justify-center rounded-full">
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
          {ctaVariant === "solid" ? (
            <span className="bg-ink text-paper mt-3 inline-flex w-fit items-center rounded-full px-3.5 py-1.5 text-[12px] font-medium">
              {actionLabel}
            </span>
          ) : (
            <span className="text-ink group-hover:text-skyline mt-3 inline-flex items-center text-[13px] font-medium transition-colors duration-200">
              {actionLabel} →
            </span>
          )}
        </div>
      </Link>
    </article>
  );
}
