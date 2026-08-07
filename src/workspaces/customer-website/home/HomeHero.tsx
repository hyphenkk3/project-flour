import Link from "next/link";

export function HomeHero() {
  return (
    <section className="relative overflow-hidden px-6 pt-16 pb-14 sm:px-10 sm:pt-24 sm:pb-20">
      <div
        aria-hidden
        className="animate-fade-in pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_0%,#ffffff_0%,transparent_45%),radial-gradient(ellipse_at_90%_80%,#c9d6e2_0%,transparent_50%),linear-gradient(165deg,#eef2f5_0%,#e3ebf1_55%,#d5e1ea_100%)]"
      />
      <div
        aria-hidden
        className="bg-signal/15 motion-safe:animate-drift pointer-events-none absolute -top-28 right-[-12%] h-[26rem] w-[26rem] rounded-full blur-3xl"
      />

      <div className="motion-safe:animate-rise relative mx-auto w-full max-w-3xl">
        <h1 className="font-display text-ink text-6xl leading-[0.92] tracking-tight sm:text-8xl">
          Whitebird
        </h1>
        <p className="text-ink mt-5 text-xl font-medium tracking-tight sm:text-2xl">
          Every celebration begins here.
        </p>
        <p className="text-skyline mt-5 max-w-xl text-base leading-relaxed sm:text-lg">
          Whether you&apos;re planning ahead or looking for a cake today,
          we&apos;ll help you find the perfect cake for your celebration.
        </p>
        <Link
          className="bg-ink text-mist hover:bg-skyline mt-10 inline-flex min-h-12 items-center justify-center rounded-xl px-6 text-sm font-medium transition"
          href="/browse"
        >
          Start Ordering
        </Link>
      </div>
    </section>
  );
}
