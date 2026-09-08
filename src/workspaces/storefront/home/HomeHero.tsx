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

function HeroCopy({
  headingClass,
  supportingClass,
}: {
  headingClass: string;
  supportingClass: string;
}) {
  return (
    <>
      <p className="text-skyline text-[11px] font-medium tracking-[0.18em] uppercase">
        Cakes made with heart
      </p>
      <h1 className={headingClass}>
        <span className="whitespace-nowrap">Every celebration</span>
        <br />
        begins here.
      </h1>
      <p className={supportingClass}>
        From everyday moments to
        <br className="md:hidden" /> once-in-a-lifetime celebrations,
        <br className="md:hidden" /> we&apos;re here to make it sweeter.
      </p>
    </>
  );
}

function HeroValueCues({
  iconClass,
  itemClass,
  listClass,
}: {
  iconClass: string;
  itemClass: string;
  listClass: string;
}) {
  return (
    <ul className={listClass}>
      {VALUE_CUES.map((cue) => (
        <li className={itemClass} key={cue.label.join(" ")}>
          <span className={iconClass}>
            <cue.Icon className="h-4 w-4" />
          </span>
          <span className="text-skyline w-full text-center text-[11px] leading-[1.3] tracking-[0.01em] md:text-left">
            {cue.label[0]}
            <br />
            {cue.label[1]}
          </span>
        </li>
      ))}
    </ul>
  );
}

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

      {header ? (
        <div className="absolute inset-x-0 top-0 z-20 md:relative">{header}</div>
      ) : null}

      {orderPanel ? (
        <div className="pointer-events-auto absolute inset-x-0 top-[3.35rem] z-20 hidden md:block">
          <div className="px-6 sm:px-10">
            <div className="mx-auto flex w-full max-w-6xl justify-end">
              {orderPanel}
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative z-10 md:hidden">
        <div className="relative h-[22.5rem] overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 bg-no-repeat"
            style={{
              backgroundImage: `url(${STOREFRONT_HOMEPAGE_HERO_SRC})`,
              backgroundPosition: "28% 46%",
              backgroundSize: "auto 122%",
              WebkitMaskImage:
                "linear-gradient(to bottom, #000 0%, #000 68%, transparent 100%)",
              maskImage:
                "linear-gradient(to bottom, #000 0%, #000 68%, transparent 100%)",
            }}
          />
          <Image
            alt="Whitebird pistachio cake in the studio"
            className="sr-only"
            height={887}
            priority
            src={STOREFRONT_HOMEPAGE_HERO_SRC}
            width={1774}
          />
          <div
            aria-hidden
            className="from-paper/16 absolute inset-y-0 left-0 z-[1] w-[30%] bg-gradient-to-r to-transparent"
          />
          <div
            aria-hidden
            className="from-paper/50 absolute inset-x-0 top-0 z-[1] h-12 bg-gradient-to-b to-transparent"
          />
          <div
            aria-hidden
            className="from-paper absolute inset-y-0 left-0 z-[1] w-3 bg-gradient-to-r to-transparent"
          />
          <div
            aria-hidden
            className="from-paper absolute inset-y-0 right-0 z-[1] w-2.5 bg-gradient-to-l to-transparent"
          />
          <div
            aria-hidden
            className="from-paper absolute inset-x-0 bottom-0 z-[1] h-16 bg-gradient-to-t to-transparent"
          />
          <div className="relative z-[2] flex h-[22.5rem] flex-col justify-start px-6 pt-[4.35rem] pb-5">
            <div className="w-full max-w-[18.25rem]">
              <HeroCopy
                headingClass="font-display text-ink mt-1.5 text-[1.98rem] leading-[1.14] tracking-[-0.02em]"
                supportingClass="text-skyline mt-2.5 max-w-[16.5rem] text-[0.82rem] leading-[1.5]"
              />
              <HeroValueCues
                iconClass="bg-paper/80 text-ink/60 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                itemClass="flex w-full min-w-0 flex-col items-center gap-1.5 text-center"
                listClass="mt-3.5 grid w-[12.5rem] grid-cols-3 gap-x-1"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 hidden px-6 pt-4 pb-5 sm:px-10 md:block md:pt-4 md:pb-6 lg:pt-4">
        <div className="mx-auto w-full max-w-6xl">
          <div className="md:max-w-[20rem] lg:max-w-[23.5rem]">
            <HeroCopy
              headingClass="font-display text-ink mt-1.5 text-[1.85rem] leading-[1.12] tracking-tight sm:mt-2 sm:text-[2.4rem] lg:text-[2.7rem]"
              supportingClass="text-skyline mt-2 max-w-md text-[0.95rem] leading-relaxed md:max-w-sm"
            />
            <HeroValueCues
              iconClass="bg-ink/[0.045] text-ink/65 flex h-7 w-7 shrink-0 items-center justify-center rounded-full md:h-8 md:w-8"
              itemClass="flex min-w-0 flex-col items-center gap-1.5 text-center md:flex-row md:items-center md:gap-2.5 md:text-left"
              listClass="mt-4 grid grid-cols-3 gap-x-3 md:mt-6.5 md:flex md:flex-wrap md:gap-x-5 md:gap-y-2 lg:gap-x-7"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
