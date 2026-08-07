import Image from "next/image";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { BrowseCake } from "@/workspaces/customer-website/browse/cakes-demo";

type CakeCardProps = {
  cake: BrowseCake;
};

export function CakeCard({ cake }: CakeCardProps) {
  const isClassic = cake.section === "classics";

  return (
    <article className="border-fog group hover:border-signal/40 flex h-full flex-col overflow-hidden rounded-3xl border bg-white transition duration-200 hover:-translate-y-0.5">
      <div className="bg-fog/40 relative aspect-[4/5] w-full overflow-hidden">
        <Image
          alt={cake.imageAlt}
          className={`object-cover transition duration-500 group-hover:scale-[1.03] ${
            isClassic ? "opacity-90" : ""
          }`}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          src={cake.imageUrl}
        />
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <StatusBadge
          label={isClassic ? "Whitebird Classic" : "Available Now"}
          tone={isClassic ? "neutral" : "success"}
        />
        <h3 className="font-display text-ink mt-3 text-2xl tracking-tight">
          {cake.name}
        </h3>
        <p className="text-skyline mt-2 flex-1 text-sm leading-relaxed">
          {cake.description}
        </p>
        <Link
          className="border-fog text-ink hover:border-signal hover:text-signal mt-6 inline-flex min-h-12 items-center justify-center rounded-xl border bg-white px-5 text-sm font-medium transition"
          href={`/browse/${cake.id}`}
        >
          View Details
        </Link>
      </div>
    </article>
  );
}
