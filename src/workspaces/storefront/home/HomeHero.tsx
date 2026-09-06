import type { ReactNode } from "react";
import Image from "next/image";
import {
  CakeMark,
  HeartMark,
  LeafMark,
} from "@/workspaces/storefront/home/HomeMarks";

export const STOREFRONT_HOMEPAGE_HERO_SRC =
  "/storefront/whitebird-homepage-hero.jpg";

const VALUE_CUES = [
  { label: ["2–3 Days", "Preorder"], Icon: CakeMark },
  { label: ["Quality", "Ingredients"], Icon: LeafMark },
  { label: ["Made", "with Care"], Icon: HeartMark },
] as const;

type HomeHeroProps = {
  orderPanel?: ReactNode;
};

export function HomeHero({ orderPanel = null }: HomeHeroProps) {
  return (
    <section className="relative overflow-x-clip">
      <div className="storefront-hero-photo pointer-events-none absolute inset-y-0 right-0 hidden w-[54%] md:block lg:w-[62%] xl:w-[68%] min-[1440px]:w-[70%]">
        <Image
          alt=""
          className="object-cover object-[58%_52%]"
          fill
          priority
          sizes="(min-width: 1440px) 70vw, (min-width: 1280px) 68vw, (min-width: 1024px) 62vw, 54vw"
          src={STOREFRONT_HOMEPAGE_HERO_SRC}
        />
        <div className="from-paper absolute inset-y-0 left-0 w-[38%] bg-gradient-to-r via-paper/55 to-transparent" />
        <div className="from-paper absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t to-transparent" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-5 pb-3 sm:px-10 sm:pt-6 sm:pb-4 md:min-h-[19.5rem] md:pb-5 lg:min-h-[22rem] lg:pt-7 lg:pb-6 xl:min-h-[23.5rem]">
        <div className="max-w-[17.5rem] sm:max-w-[20rem] lg:max-w-[23.5rem]">
          <p className="text-skyline text-[11px] font-medium tracking-[0.18em] uppercase">
            Cakes made with heart
          </p>
          <h1 className="font-display text-ink mt-2.5 text-[1.85rem] leading-[1.12] tracking-tight sm:mt-3 sm:text-[2.4rem] lg:text-[2.7rem]">
            Every celebration
            <span className="hidden md:inline">
              <br />
            </span>{" "}
            begins here.
          </h1>
          <p className="text-skyline mt-3 max-w-sm text-[0.95rem] leading-relaxed sm:mt-3.5">
            From everyday moments to once-in-a-lifetime celebrations,
            we&apos;re here to make it sweeter.
          </p>
          <ul className="mt-5 flex gap-4 sm:mt-6 sm:gap-5 lg:gap-7">
            {VALUE_CUES.map((cue) => (
              <li className="flex items-center gap-2.5" key={cue.label.join(" ")}>
                <span className="bg-ink/[0.06] text-ink/70 flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                  <cue.Icon className="h-[17px] w-[17px]" />
                </span>
                <span className="text-skyline text-[11px] leading-[1.25]">
                  {cue.label[0]}
                  <br />
                  {cue.label[1]}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {orderPanel ? (
          <div className="pointer-events-auto mt-5 md:absolute md:bottom-5 md:left-10 md:mt-0">
            {orderPanel}
          </div>
        ) : null}
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6 pb-3 sm:px-10 md:hidden">
        <div className="storefront-hero-photo-mobile relative h-36 overflow-hidden">
          <Image
            alt="Whitebird pistachio cake in the studio"
            className="object-cover object-[60%_50%]"
            fill
            priority
            sizes="100vw"
            src={STOREFRONT_HOMEPAGE_HERO_SRC}
          />
          <div className="from-paper absolute inset-x-0 top-0 h-8 bg-gradient-to-b to-transparent" />
          <div className="from-paper absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t to-transparent" />
        </div>
      </div>
    </section>
  );
}
