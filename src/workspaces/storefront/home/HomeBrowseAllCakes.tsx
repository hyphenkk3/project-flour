import Link from "next/link";

export function HomeBrowseAllCakes() {
  return (
    <section className="px-6 pt-6">
      <Link className="group block" href="/browse">
        <p className="text-ink text-[15px] font-medium tracking-tight">
          Browse all cakes
          <span aria-hidden="true"> →</span>
        </p>
        <p className="text-skyline mt-1 max-w-[18rem] text-[13px] leading-relaxed">
          Explore the full Whitebird collection
        </p>
      </Link>
    </section>
  );
}
