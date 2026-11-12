export function retainLatestToastItems<T>(
  current: T[],
  incoming: T,
  maximum = 5,
): { retained: T[]; evicted: T[] } {
  const combined = [...current, incoming];
  const evicted =
    combined.length > maximum
      ? combined.slice(0, combined.length - maximum)
      : [];
  return {
    retained: combined.slice(-maximum),
    evicted,
  };
}
