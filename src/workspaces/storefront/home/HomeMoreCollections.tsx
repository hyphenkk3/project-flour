import Link from "next/link";

export type HomeMoreCollectionLink = {
  href: string;
  heading: string;
  supporting: string;
};

type HomeMoreCollectionsProps = {
  items: readonly HomeMoreCollectionLink[];
};

export function HomeMoreCollections({ items }: HomeMoreCollectionsProps) {
  if (items.length === 0) return null;

  return (
    <section className="px-6 pt-5 pb-1 sm:px-10">
      <div className="mx-auto w-full max-w-6xl">
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.href}>
              <Link className="group block" href={item.href}>
                <p className="text-ink text-[15px] font-medium tracking-tight">
                  {item.heading}
                  <span aria-hidden="true"> →</span>
                </p>
                <p className="text-skyline mt-1 max-w-[18rem] text-[13px] leading-relaxed">
                  {item.supporting}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
