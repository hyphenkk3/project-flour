/**
 * Scroll Availability section headings below the sticky TopHeader and the
 * sticky Availability section nav.
 *
 * Native hash scrolling (and CSS scroll-margin) is unreliable in Safari:
 * the heading can land under the sticky bars or partway into the card.
 */

const STICKY_HEADER_FALLBACK_PX = 72;
const SECTION_NAV_FALLBACK_PX = 60;
const EXTRA_GAP_PX = 8;

export const AVAILABILITY_SECTION_NAV_ATTR = "data-availability-section-nav";

function elementHeightPx(
  el: Element | null,
  fallback: number,
): number {
  if (!(el instanceof HTMLElement)) return fallback;
  const height = el.getBoundingClientRect().height;
  return Number.isFinite(height) && height > 0 ? height : fallback;
}

function stickyOffsetPx(): number {
  if (typeof document === "undefined") {
    return STICKY_HEADER_FALLBACK_PX + SECTION_NAV_FALLBACK_PX + EXTRA_GAP_PX;
  }
  const header = document.querySelector("header.sticky");
  const nav = document.querySelector(`[${AVAILABILITY_SECTION_NAV_ATTR}]`);
  return (
    elementHeightPx(header, STICKY_HEADER_FALLBACK_PX) +
    elementHeightPx(nav, SECTION_NAV_FALLBACK_PX) +
    EXTRA_GAP_PX
  );
}

function documentScrollY(): number {
  return window.scrollY || document.documentElement.scrollTop || 0;
}

export function scrollAvailabilitySectionIntoView(
  id: string,
  options?: { behavior?: ScrollBehavior; focus?: boolean },
): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;

  const top = Math.max(
    0,
    el.getBoundingClientRect().top + documentScrollY() - stickyOffsetPx(),
  );
  window.scrollTo({
    top,
    behavior: options?.behavior ?? "smooth",
  });

  if (options?.focus && typeof el.focus === "function") {
    if (!el.hasAttribute("tabindex")) {
      el.setAttribute("tabindex", "-1");
    }
    el.focus({ preventScroll: true });
  }
}
