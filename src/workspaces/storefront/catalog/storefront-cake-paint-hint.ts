import { canonicalCakeDetailPath } from "@/workspaces/storefront/catalog/cake-detail-prefetch";
import {
  CAKE_HERO_SIZES,
  cakeHeroImageSrc,
  cakeHeroImageSrcSet,
} from "@/workspaces/storefront/catalog/cake-hero-preload";

export type StorefrontCakePaintHint = {
  cakeId: string;
  name: string;
  imageSrc: string;
};

const OVERLAY_ID = "wb-cake-paint";

let hint: StorefrontCakePaintHint | null = null;
let readyCakeId: string | null = null;

export function cakeIdFromCakeDetailPath(pathname: string): string | null {
  const canonical = canonicalCakeDetailPath(pathname);
  if (!canonical) return null;
  return canonical.slice("/cakes/".length);
}

export function rememberStorefrontCakePaintHint(input: {
  href: string;
  name?: string | null;
  imageSrc?: string | null;
}): StorefrontCakePaintHint | null {
  const cakeId = cakeIdFromCakeDetailPath(input.href);
  if (!cakeId) return null;
  const name = input.name?.trim() ?? "";
  const imageSrc = input.imageSrc?.trim() ?? "";
  if (!name && !imageSrc) return null;
  hint = { cakeId, name, imageSrc };
  if (readyCakeId !== cakeId) readyCakeId = null;
  return hint;
}

export function readStorefrontCakePaintHint(
  cakeId: string,
): StorefrontCakePaintHint | null {
  if (!hint || hint.cakeId !== cakeId) return null;
  return hint;
}

export function markStorefrontCakeDetailPaintReady(cakeId: string): void {
  const id = cakeId.trim();
  if (!id) return;
  readyCakeId = id;
  hideStorefrontCakePaintOverlay();
}

export function isStorefrontCakeDetailPaintReady(cakeId: string): boolean {
  return readyCakeId === cakeId;
}

export function resetStorefrontCakePaintHintForTests(): void {
  hint = null;
  readyCakeId = null;
  hideStorefrontCakePaintOverlay();
}

function overlayElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(OVERLAY_ID);
}

export function hideStorefrontCakePaintOverlay(): void {
  overlayElement()?.remove();
}

export function showStorefrontCakePaintOverlay(
  nextHint: StorefrontCakePaintHint | null = hint,
): boolean {
  if (!nextHint || typeof document === "undefined") return false;
  if (readyCakeId === nextHint.cakeId) return false;

  let root = overlayElement();
  if (!root) {
    root = document.createElement("div");
    root.id = OVERLAY_ID;
    root.setAttribute("aria-hidden", "true");
    root.className =
      "bg-paper pointer-events-none fixed inset-0 z-20 overflow-y-auto";
    document.body.appendChild(root);
  }

  const photo = nextHint.imageSrc
    ? `<img alt="" class="h-full w-full rounded-[10px] object-cover" sizes="${escapeHtml(CAKE_HERO_SIZES)}" src="${escapeHtml(cakeHeroImageSrc(nextHint.imageSrc))}" srcset="${escapeHtml(cakeHeroImageSrcSet(nextHint.imageSrc))}" />`
    : "";
  const name = nextHint.name
    ? `<p class="font-display text-ink mt-3 text-3xl leading-tight tracking-tight sm:text-4xl">${escapeHtml(nextHint.name)}</p>`
    : `<div class="bg-fog mt-3 h-8 w-3/4 rounded-sm sm:h-10"></div>`;

  root.innerHTML = `
    <div class="bg-paper mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <p class="text-skyline text-sm font-medium">← Whitebird</p>
      <p class="text-skyline text-sm font-medium">Opening cake</p>
      <div class="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-10">
        <div class="space-y-3">
          <div class="overflow-hidden rounded-[10px]">
            <div class="bg-fog aspect-square w-full overflow-hidden rounded-[10px]">${photo}</div>
          </div>
        </div>
        <div class="flex flex-col gap-5 lg:gap-6">
          <div>
            <div class="bg-fog h-3 w-20 rounded-sm"></div>
            ${name}
            <div class="bg-fog mt-3 h-4 w-full rounded-sm"></div>
            <div class="bg-fog mt-2 h-4 w-5/6 rounded-sm"></div>
          </div>
          <section class="border-fog border-t pt-5">
            <div class="bg-fog h-3 w-28 rounded-sm"></div>
            <ul class="mt-3 grid gap-2">
              <li class="border-fog bg-fog/40 min-h-12 w-full border"></li>
              <li class="border-fog bg-fog/40 min-h-12 w-full border"></li>
            </ul>
          </section>
          <div class="bg-fog h-11 w-full rounded-md"></div>
        </div>
      </div>
    </div>
  `;
  return true;
}

export function syncStorefrontCakePaintOverlay(pathname: string): void {
  const cakeId = cakeIdFromCakeDetailPath(pathname);
  const next = cakeId ? readStorefrontCakePaintHint(cakeId) : null;
  if (next && !isStorefrontCakeDetailPaintReady(next.cakeId)) {
    showStorefrontCakePaintOverlay(next);
    return;
  }
  hideStorefrontCakePaintOverlay();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
