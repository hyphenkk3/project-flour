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
      <div
        aria-hidden
        className="storefront-hero-photo pointer-events-none absolute top-0 right-0 -bottom-10 hidden bg-paper bg-cover bg-no-repeat md:block w-[90%] lg:w-[84%] xl:w-[80%]"
        style={{
          backgroundImage: `url(${STOREFRONT_HOMEPAGE_HERO_SRC})`,
          backgroundPosition: "48% 52%",
        }}
      >
        <div className="from-paper absolute inset-y-0 left-0 w-[28%] bg-gradient-to-r via-paper/50 to-transparent" />
        <div className="from-paper absolute inset-y-0 right-0 w-[10%] bg-gradient-to-l to-transparent" />
        <div className="from-paper absolute inset-x-0 top-0 h-36 bg-gradient-to-b to-transparent" />
        <div className="from-paper absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t to-transparent" />
      </div>

      {header ? <div className="relative z-20">{header}</div> : null}

      {orderPanel ? (
        <div className="pointer-events-auto absolute top-[3.35rem] right-6 z-20 hidden md:block lg:right-10">
          {orderPanel}
        </div>
      ) : null}

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-3 pb-2 sm:px-10 sm:pt-4 sm:pb-3 lg:pt-4 lg:pb-3">
        <div className="max-w-[17.5rem] sm:max-w-[20rem] lg:max-w-[23.5rem]">
          <p className="text-skyline text-[11px] font-medium tracking-[0.18em] uppercase">
            Cakes made with heart
          </p>
          <h1 className="font-display text-ink mt-1.5 text-[1.85rem] leading-[1.12] tracking-tight sm:mt-2 sm:text-[2.4rem] lg:text-[2.7rem]">
            Every celebration
            <span className="hidden md:inline">
              <br />
            </span>{" "}
            begins here.
          </h1>
          <p className="text-skyline mt-2 max-w-sm text-[0.95rem] leading-relaxed">
            From everyday moments to once-in-a-lifetime celebrations,
            we&apos;re here to make it sweeter.
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 sm:mt-3.5 sm:gap-x-5 lg:gap-x-7">
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
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-3 sm:px-10 md:hidden">
        <div className="storefront-hero-photo-mobile relative h-32 overflow-hidden">
          <Image
            alt="Whitebird pistachio cake in the studio"
            className="object-cover object-[64%_46%]"
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
