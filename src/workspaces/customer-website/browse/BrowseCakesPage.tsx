import Link from "next/link";
import { CakeCard } from "@/workspaces/customer-website/browse/CakeCard";
import type { BrowseCake } from "@/workspaces/customer-website/browse/cakes-demo";

type CakeSectionProps = {
  title: string;
  description?: string;
  cakes: BrowseCake[];
};

function CakeSection({ title, description, cakes }: CakeSectionProps) {
  return (
    <section className="space-y-6 sm:space-y-8">
      <div className="max-w-2xl">
        <h2 className="font-display text-ink text-3xl tracking-tight sm:text-4xl">
          {title}
        </h2>
        {description ? (
          <p className="text-skyline mt-3 text-base leading-relaxed sm:text-lg">
            {description}
          </p>
        ) : null}
      </div>
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 xl:grid-cols-4">
        {cakes.map((cake) => (
          <li className="h-full" key={cake.id}>
            <CakeCard cake={cake} />
          </li>
        ))}
      </ul>
    </section>
  );
}

type BrowseCakesPageProps = {
  availableNow: BrowseCake[];
  classics: BrowseCake[];
};

export function BrowseCakesPage({
  availableNow,
  classics,
}: BrowseCakesPageProps) {
  return (
    <main className="bg-mist min-h-dvh">
      <div className="relative overflow-hidden px-6 pt-10 pb-8 sm:px-10 sm:pt-14 sm:pb-10">
        <div
          aria-hidden
          className="animate-fade-in pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_12%_0%,#ffffff_0%,transparent_42%),linear-gradient(165deg,#eef2f5_0%,#e8eef3_55%,#dfe8ef_100%)]"
        />
        <div className="relative mx-auto w-full max-w-7xl">
          <Link
            className="text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium transition"
            href="/"
          >
            ← Whitebird
          </Link>
          <h1 className="font-display text-ink mt-6 text-4xl tracking-tight sm:text-6xl">
            Browse Cakes
          </h1>
          <p className="text-skyline mt-4 max-w-2xl text-base leading-relaxed sm:text-lg">
            Discover our current collection and explore some of our favourite
            creations.
          </p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-6 pb-20 sm:gap-20 sm:px-10 sm:pb-28">
        <CakeSection
          cakes={availableNow}
          description="Cakes you can choose from today — take your time looking."
          title="Available Now"
        />
        <CakeSection
          cakes={classics}
          description="Beloved Whitebird creations from seasons past — here for inspiration."
          title="Whitebird Classics"
        />
      </div>
    </main>
  );
}
