type HorizontalBounds = {
  left: number;
  right: number;
};

/** Returns a target scroll offset only when the active workspace is clipped. */
export function activeItemScrollTarget(
  container: HorizontalBounds,
  item: HorizontalBounds,
  currentScrollLeft: number,
  visiblePadding = 0,
): number | null {
  const visibleLeft = container.left + visiblePadding;
  const visibleRight = container.right - visiblePadding;

  if (item.left >= visibleLeft && item.right <= visibleRight) return null;
  if (item.left < visibleLeft)
    return currentScrollLeft - (visibleLeft - item.left);
  return currentScrollLeft + (item.right - visibleRight);
}
