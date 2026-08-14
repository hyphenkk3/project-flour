/**
 * Scroll workspace sections into view below the sticky TopHeader.
 * scrollIntoView({ block: "start" }) alone lands the target under the header,
 * so the section can appear not to move / not to show its heading.
 */

const STICKY_HEADER_FALLBACK_PX = 72;
const EXTRA_GAP_PX = 8;

function stickyHeaderOffsetPx(): number {
  if (typeof document === "undefined") return STICKY_HEADER_FALLBACK_PX;
  const header = document.querySelector("header.sticky");
  if (!(header instanceof HTMLElement)) return STICKY_HEADER_FALLBACK_PX;
  const height = header.getBoundingClientRect().height;
  return Number.isFinite(height) && height > 0
    ? height
    : STICKY_HEADER_FALLBACK_PX;
}

/** Scroll so `id` is visible below the sticky app header; optionally focus. */
export function scrollWorkspaceSectionIntoView(
  id: string,
  options?: { focus?: boolean },
): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;

  const top =
    el.getBoundingClientRect().top +
    window.scrollY -
    stickyHeaderOffsetPx() -
    EXTRA_GAP_PX;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });

  if (options?.focus && typeof el.focus === "function") {
    if (!el.hasAttribute("tabindex")) {
      el.setAttribute("tabindex", "-1");
    }
    el.focus({ preventScroll: true });
  }
}
