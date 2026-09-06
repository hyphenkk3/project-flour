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
    <section className="px-6 pt-7 pb-4 sm:px-10 sm:pt-12 sm:pb-8">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:gap-10 lg:gap-16">
        <div>
          <p className="text-skyline text-[11px] font-medium tracking-[0.18em] uppercase">
            Cakes made with heart
          </p>
          <h1 className="font-display text-ink mt-3 max-w-xl text-[1.85rem] leading-[1.15] tracking-tight sm:text-5xl">
            Every celebration
            <span className="hidden md:inline">
              <br />
            </span>{" "}
            begins here.
          </h1>
          <p className="text-skyline mt-3 max-w-lg text-[0.95rem] leading-relaxed sm:mt-5 sm:text-base">
            From everyday moments to once-in-a-lifetime celebrations,
            we&apos;re here to make it sweeter.
          </p>
          <ul className="text-skyline mt-5 hidden gap-x-6 gap-y-2 text-[12px] tracking-[0.04em] md:flex md:flex-wrap">
            {VALUE_CUES.map((cue) => (
              <li className="flex items-center gap-2" key={cue}>
                <span
                  aria-hidden="true"
                  className="border-ink/25 inline-block h-2 w-2 rounded-full border"
                />
                {cue}
              </li>
            ))}
          </ul>
          <p className="text-skyline mt-4 text-[11px] font-medium tracking-[0.18em] uppercase md:hidden">
            2–3 Days Preorder · Made with Care
          </p>
        </div>

        <div className="relative min-h-0 md:min-h-[16rem]">
          {imageUrl ? (
            <div className="relative hidden overflow-hidden md:block md:h-72 lg:h-[22rem]">
              <CakePhotoImage
                alt={imageAlt || "Whitebird cake"}
                priority
                sizes="(min-width: 1024px) 40vw, 50vw"
                src={imageUrl}
              />
              <div className="from-paper/70 absolute inset-0 bg-gradient-to-r to-transparent to-40%" />
            </div>
          ) : null}
          {orderPanel ? (
            <div className="pointer-events-auto md:absolute md:right-0 md:bottom-6 md:z-10">
              {orderPanel}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
