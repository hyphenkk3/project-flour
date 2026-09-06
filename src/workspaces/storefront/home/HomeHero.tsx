import type { ReactNode } from "react";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";

const VALUE_CUES = [
  "2–3 Days Preorder",
  "Quality Ingredients",
  "Made with Care",
] as const;

type HomeHeroProps = {
  imageUrl?: string | null;
  imageAlt?: string | null;
  orderPanel?: ReactNode;
};

export function HomeHero({
  imageUrl = null,
  imageAlt = null,
  orderPanel = null,
}: HomeHeroProps) {
  return (
    <section className="relative md:min-h-[20.5rem] md:overflow-x-clip lg:min-h-[22.5rem]">
      {imageUrl ? (
        <div className="storefront-hero-photo pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] md:block lg:w-[min(58vw,48rem)]">
          <div className="relative h-full [&_img]:object-cover [&_img]:object-[72%_center]">
            <CakePhotoImage
              alt={imageAlt || "Whitebird cake"}
              priority
              sizes="(min-width: 1024px) 48vw, 46vw"
              src={imageUrl}
            />
            <div className="from-paper via-paper/70 absolute inset-0 bg-gradient-to-r from-[6%] via-[30%] to-transparent to-[58%]" />
            <div className="from-paper absolute inset-x-0 top-0 h-10 bg-gradient-to-b to-transparent" />
            <div className="from-paper absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t to-transparent" />
          </div>
        </div>
      ) : null}

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-6 pb-4 sm:px-10 sm:pt-8 sm:pb-5">
        <div className="max-w-[20.5rem] sm:max-w-md lg:max-w-[28rem]">
          <p className="text-skyline text-[11px] font-medium tracking-[0.18em] uppercase">
            Cakes made with heart
          </p>
          <h1 className="font-display text-ink mt-2.5 text-[1.85rem] leading-[1.12] tracking-tight sm:mt-3 sm:text-[2.75rem]">
            Every celebration
            <span className="hidden md:inline">
              <br />
            </span>{" "}
            begins here.
          </h1>
          <p className="text-skyline mt-3 max-w-md text-[0.95rem] leading-relaxed sm:mt-4">
            From everyday moments to once-in-a-lifetime celebrations,
            we&apos;re here to make it sweeter.
          </p>
          <p className="text-skyline mt-5 hidden text-[12px] tracking-[0.06em] md:block">
            {VALUE_CUES.join("  ·  ")}
          </p>
          <p className="text-skyline mt-4 text-[11px] font-medium tracking-[0.16em] uppercase md:hidden">
            2–3 Days Preorder · Made with Care
          </p>
        </div>

        {orderPanel ? (
          <div className="pointer-events-auto mt-5 md:absolute md:right-10 md:bottom-5 md:mt-0 lg:right-6">
            {orderPanel}
          </div>
        ) : null}
      </div>
    </section>
  );
}
