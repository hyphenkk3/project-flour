import type { ReactNode } from "react";
import Image from "next/image";

export const STOREFRONT_HOMEPAGE_HERO_SRC =
  "/storefront/whitebird-homepage-hero.jpg";

const VALUE_CUES = [
  "2–3 Days Preorder",
  "Quality Ingredients",
  "Made with Care",
] as const;

type HomeHeroProps = {
  orderPanel?: ReactNode;
};

export function HomeHero({ orderPanel = null }: HomeHeroProps) {
  return (
    <section className="relative overflow-x-clip">
      <div className="storefront-hero-photo pointer-events-none absolute inset-0 hidden md:block">
        <Image
          alt=""
          className="object-cover object-[64%_56%] lg:object-[58%_54%]"
          fill
          priority
          sizes="100vw"
          src={STOREFRONT_HOMEPAGE_HERO_SRC}
        />
        <div className="from-paper/30 absolute inset-y-0 left-0 w-[min(36%,22rem)] bg-gradient-to-r to-transparent" />
        <div className="from-paper absolute inset-x-0 top-0 h-8 bg-gradient-to-b to-transparent" />
        <div className="from-paper absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t to-transparent" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-6 pb-4 sm:px-10 sm:pt-8 sm:pb-5 md:min-h-[21.5rem] md:pb-8 lg:min-h-[25.5rem] lg:pt-9 lg:pb-9">
        <div className="max-w-[20.5rem] sm:max-w-[22.5rem] lg:max-w-md">
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
          <div className="pointer-events-auto mt-5 md:absolute md:bottom-7 md:left-10 md:mt-0">
            {orderPanel}
          </div>
        ) : null}
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6 pb-4 sm:px-10 md:hidden">
        <div className="storefront-hero-photo-mobile relative h-40 overflow-hidden">
          <Image
            alt="Whitebird pistachio cake in the studio"
            className="object-cover object-[58%_52%]"
            fill
            priority
            sizes="100vw"
            src={STOREFRONT_HOMEPAGE_HERO_SRC}
          />
          <div className="from-paper absolute inset-x-0 top-0 h-7 bg-gradient-to-b to-transparent" />
          <div className="from-paper absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t to-transparent" />
        </div>
      </div>
    </section>
  );
}
