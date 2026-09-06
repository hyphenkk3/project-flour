import Link from "next/link";
import type { ReactNode } from "react";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";

export type HomeDestinationTone = "cream" | "sage" | "linen";

const TONE_CLASS: Record<
  HomeDestinationTone,
  { surface: string; fade: string }
> = {
  cream: {
    surface: "bg-[#efe6d8]",
    fade: "from-[#efe6d8]",
  },
  sage: {
    surface: "bg-[#e5ebe4]",
    fade: "from-[#e5ebe4]",
  },
  linen: {
    surface: "bg-[#ebe6da]",
    fade: "from-[#ebe6da]",
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
    <article className="h-[10.25rem] md:h-[11.5rem]">
      <Link
        className={`group border-ink/10 relative flex h-full overflow-hidden rounded-lg border transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/30 ${colors.surface}`}
        href={href}
      >
        {hasImage && imageUrl ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[48%] [&_img]:object-[70%_center]">
            <CakePhotoImage
              alt={imageAlt || ""}
              sizes="180px"
              src={imageUrl}
            />
            <div
              className={`absolute inset-0 bg-gradient-to-r to-transparent ${colors.fade} from-[12%]`}
            />
          </div>
        ) : null}

        <div
          className={[
            "relative z-10 flex h-full min-w-0 flex-col justify-between px-4 py-4 sm:px-5",
            hasImage ? "w-[58%] pr-3" : "w-full",
          ].join(" ")}
        >
          <div className="min-w-0">
            <h3 className="font-display text-ink text-[1.2rem] leading-tight tracking-tight sm:text-[1.32rem]">
              {title}
            </h3>
            <p className="text-skyline mt-1.5 line-clamp-2 text-[13px] leading-relaxed">
              {description}
            </p>
            {extra}
          </div>
          <span className="text-ink group-hover:text-skyline mt-3 inline-flex min-h-11 items-center text-[13px] font-medium transition-colors duration-200">
            {actionLabel} →
          </span>
        </div>
      </Link>
    </article>
  );
}
