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
  header?: ReactNode;
  orderPanel?: ReactNode;
};

export function HomeHero({ header = null, orderPanel = null }: HomeHeroProps) {
  return (
    <section className="relative overflow-x-clip">
      <div className="storefront-hero-photo pointer-events-none absolute top-0 -bottom-8 right-[9%] hidden w-[51%] md:block lg:right-[10%] lg:w-[54%] xl:w-[52%]">
        <Image
          alt=""
          className="object-cover object-[58%_50%]"
          fill
          priority
          sizes="(min-width: 1280px) 52vw, (min-width: 1024px) 54vw, 51vw"
          src={STOREFRONT_HOMEPAGE_HERO_SRC}
        />
        <div className="from-paper absolute inset-y-0 left-0 w-[42%] bg-gradient-to-r via-paper/50 to-transparent" />
        <div className="from-paper absolute inset-x-0 top-0 h-28 bg-gradient-to-b via-paper/40 to-transparent" />
        <div className="from-paper absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t via-paper/50 to-transparent" />
      </div>

      {header ? <div className="relative z-20">{header}</div> : null}

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-4 pb-4 sm:px-10 sm:pt-5 sm:pb-5 lg:pt-6 lg:pb-5">
        <div className="max-w-[17.5rem] sm:max-w-[20rem] lg:max-w-[23.5rem]">
          <p className="text-skyline text-[11px] font-medium tracking-[0.18em] uppercase">
            Cakes made with heart
          </p>
          <h1 className="font-display text-ink mt-2 text-[1.85rem] leading-[1.12] tracking-tight sm:mt-2.5 sm:text-[2.4rem] lg:text-[2.7rem]">
            Every celebration
            <span className="hidden md:inline">
              <br />
            </span>{" "}
            begins here.
          </h1>
          <p className="text-skyline mt-2.5 max-w-sm text-[0.95rem] leading-relaxed sm:mt-3">
            From everyday moments to once-in-a-lifetime celebrations,
            we&apos;re here to make it sweeter.
          </p>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2.5 sm:mt-5 sm:gap-x-5 lg:gap-x-7">
            {VALUE_CUES.map((cue) => (
              <li className="flex items-center gap-2.5" key={cue.label.join(" ")}>
                <span className="bg-ink/[0.045] text-ink/65 flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9">
                  <cue.Icon className="h-4 w-4" />
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
          <div className="pointer-events-auto mt-4 md:absolute md:bottom-4 md:left-10 md:mt-0">
            {orderPanel}
          </div>
        ) : null}
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-3 sm:px-10 md:hidden">
        <div className="storefront-hero-photo-mobile relative h-32 overflow-hidden">
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
