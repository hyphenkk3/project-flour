import Link from "next/link";
import { FreshPicksCard } from "@/workspaces/customer-website/home/FreshPicksCard";

type ActionCardProps = {
  emoji: string;
  title: string;
  description: string;
  actionLabel: string;
  href?: string;
};

function ActionCard({
  emoji,
  title,
  description,
  actionLabel,
  href,
}: ActionCardProps) {
  return (
    <article className="border-fog hover:border-signal/50 flex h-full flex-col rounded-3xl border bg-white p-6 transition duration-200 hover:-translate-y-0.5 sm:p-7">
      <p className="text-3xl" aria-hidden>
        {emoji}
      </p>
      <h3 className="text-ink mt-4 text-xl font-semibold tracking-tight">
        {title}
      </h3>
      <p className="text-skyline mt-3 flex-1 text-sm leading-relaxed sm:text-base">
        {description}
      </p>
      {href ? (
        <Link
          className="bg-ink text-mist hover:bg-skyline mt-8 inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
          href={href}
        >
          {actionLabel}
        </Link>
      ) : (
        <button
          className="bg-ink text-mist hover:bg-skyline mt-8 inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
          type="button"
        >
          {actionLabel}
        </button>
      )}
    </article>
  );
}

export function HomeActionCards() {
  return (
    <section className="px-6 pb-20 sm:px-10 sm:pb-28">
      <div className="mx-auto grid w-full max-w-6xl gap-5 sm:gap-6 md:grid-cols-3">
        <ActionCard
          actionLabel="Start Ordering"
          description="Ready to place an order? We'll guide you step by step."
          emoji="🎂"
          href="/browse"
          title="Order a Cake"
        />
        <ActionCard
          actionLabel="Browse Cakes"
          description="Discover our current collection and explore some of our favourite creations."
          emoji="🍰"
          href="/browse"
          title="Browse Cakes"
        />
        <FreshPicksCard />
      </div>
    </section>
  );
}
