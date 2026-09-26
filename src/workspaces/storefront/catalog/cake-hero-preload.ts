const HERO_WIDTHS = [384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840] as const;
const HERO_SIZES = "(min-width: 1024px) 50vw, 100vw";
const HERO_QUALITY = 75;

const preloaded = new Set<string>();

export function resetCakeHeroPreloadForTests(): void {
  preloaded.clear();
}

export function wasCakeHeroPreloadedForTests(src: string): boolean {
  return preloaded.has(src);
}

export function cakeHeroImageSrcSet(src: string): string {
  return HERO_WIDTHS.map(
    (width) =>
      `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${HERO_QUALITY} ${width}w`,
  ).join(", ");
}

/** Same next/image candidates Cake Detail already requests for the hero. */
export function preloadStorefrontCakeHero(src: string | null | undefined): boolean {
  const url = src?.trim() ?? "";
  if (!url || typeof document === "undefined") return false;
  if (preloaded.has(url)) return false;
  preloaded.add(url);
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.setAttribute("imageSrcSet", cakeHeroImageSrcSet(url));
  link.setAttribute("imageSizes", HERO_SIZES);
  document.head.appendChild(link);
  return true;
}
