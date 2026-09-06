import Link from "next/link";
import type { ReactNode } from "react";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";

export type HomeDestinationTone = "cream" | "blush" | "sage";

const TONE_CLASS: Record<
  HomeDestinationTone,
  { surface: string; fade: string }
> = {
  cream: {
    surface: "bg-[#efe6d8]",
    fade: "from-[#efe6d8]",
  },
  blush: {
    surface: "bg-[#f3e4d8]",
    fade: "from-[#f3e4d8]",
  },
  sage: {
    surface: "bg-[#e4ebe4]",
    fade: "from-[#e4ebe4]",
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
    <article
      className={`border-ink/10 relative overflow-hidden rounded-lg border shadow-[0_1px_10px_rgba(28,25,22,0.045)] ${colors.surface}`}
    >
      {hasImage && imageUrl ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[40%]">
          <CakePhotoImage
            alt={imageAlt || title}
            sizes="160px"
            src={imageUrl}
          />
          <div
            className={`absolute inset-0 bg-gradient-to-r to-transparent ${colors.fade} from-15%`}
          />
        </div>
      ) : null}
      <div
        className={[
          "relative z-10 flex min-h-[10.5rem] flex-col justify-between gap-3 px-5 py-5 sm:min-h-[11.25rem]",
          hasImage ? "pr-[42%]" : "",
        ].join(" ")}
      >
        <div>
          <h3 className="font-display text-ink text-[1.35rem] leading-tight tracking-tight sm:text-2xl">
            {title}
          </h3>
          <p className="text-skyline mt-2 line-clamp-2 text-sm leading-relaxed">
            {description}
          </p>
          {extra}
        </div>
        <Link
          className="text-ink hover:text-skyline inline-flex min-h-11 items-center text-sm font-medium transition-colors duration-200"
          href={href}
        >
          {actionLabel} →
        </Link>
      </div>
    </article>
  );
}
