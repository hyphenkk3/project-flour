import Link from "next/link";
import { storefrontKickerClass } from "@/workspaces/storefront/StorefrontBrand";

export function HomeBrowseAllCakes() {
  return (
    <section className="border-ink/[0.1] mt-8 border-t px-6 pt-8 pb-2 sm:px-10">
      <div className="mx-auto w-full max-w-6xl">
        <p className={storefrontKickerClass}>Catalogue</p>
        <Link className="group mt-2 block" href="/browse">
          <p className="text-ink text-[15px] font-medium tracking-tight">
            Browse all cakes
            <span aria-hidden="true"> →</span>
          </p>
          <p className="text-skyline mt-1 max-w-[18rem] text-[13px] leading-relaxed">
            Explore the full Whitebird collection
          </p>
        </Link>
      </div>
    </section>
  );
}
