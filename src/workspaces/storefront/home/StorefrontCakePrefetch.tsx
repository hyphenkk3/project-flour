import Link from "next/link";
import { HOMEPAGE_COLLECTION_PREVIEW_DISPLAY_MAX_LG } from "@/engines/menu/homepage-collection-preview";

type StorefrontCakePrefetchProps = {
  excludeIds?: readonly string[];
  hrefs: readonly string[];
};

/** Canonical cake-detail prefetch for Home featured cakes already shown. */
export function StorefrontCakePrefetch({
  excludeIds = [],
  hrefs,
}: StorefrontCakePrefetchProps) {
  const excluded = new Set(excludeIds);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const href of hrefs) {
    const id = href.match(/^\/cakes\/([^/?#]+)/)?.[1];
    if (!id || excluded.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= HOMEPAGE_COLLECTION_PREVIEW_DISPLAY_MAX_LG) break;
  }
  if (ids.length === 0) return null;

  return (
    <div aria-hidden="true" hidden>
      {ids.map((id) => (
        <Link href={`/cakes/${id}`} key={id} prefetch tabIndex={-1}>
          Cake
        </Link>
      ))}
    </div>
  );
}
