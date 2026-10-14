/** Pickup calendar dates only. Availability is independent of pricing and lead time. */
export type CakeSizeAvailability = {
  availableFrom?: string | null;
  availableUntil?: string | null;
};

export function isAvailabilityDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function cakeSizeAvailabilityRangeError(
  from: string | null,
  until: string | null,
): string | null {
  if (
    (from && !isAvailabilityDate(from)) ||
    (until && !isAvailabilityDate(until))
  ) {
    return "Enter valid availability dates.";
  }
  return from && until && until < from
    ? "Available Until cannot be earlier than Available From."
    : null;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function cakeSizeAvailabilityPeriod(
  size: CakeSizeAvailability,
): string | null {
  const from = size.availableFrom;
  const until = size.availableUntil;
  if (from && until)
    return `Available from ${formatDate(from)} until ${formatDate(until)}`;
  if (from) return `Available from ${formatDate(from)}`;
  if (until) return `Available until ${formatDate(until)}`;
  return null;
}

export function cakeSizeAvailability(
  size: CakeSizeAvailability,
  pickupDate?: string | null,
): { available: boolean; message: string | null } {
  const period = cakeSizeAvailabilityPeriod(size);
  if (!pickupDate)
    return {
      available: !period,
      message: period ? `${period}. Select a pickup date.` : null,
    };
  if (!isAvailabilityDate(pickupDate))
    return { available: false, message: "Select a valid pickup date." };
  const available =
    (!size.availableFrom || pickupDate >= size.availableFrom) &&
    (!size.availableUntil || pickupDate <= size.availableUntil);
  return {
    available,
    message: available
      ? period
      : `${period}. Choose another size or pickup date.`,
  };
}

/** Clear an invalid selection; never choose its replacement. */
export function validCakeSizeSelection<
  T extends CakeSizeAvailability & { id: string },
>(sizes: readonly T[], selectedId: string, pickupDate?: string | null): string {
  const size = sizes.find((entry) => entry.id === selectedId);
  return size && cakeSizeAvailability(size, pickupDate).available
    ? selectedId
    : "";
}

export function cartSizeAvailabilityError(
  items: readonly {
    cakeId: string;
    sizeId: string;
    cakeName?: string;
    sizeLabel?: string;
  }[],
  cakes: readonly {
    id: string;
    name: string;
    sizes: readonly (CakeSizeAvailability & { id: string; size: string })[];
  }[],
  pickupDate?: string | null,
): string | null {
  for (const item of items) {
    const cake = cakes.find((entry) => entry.id === item.cakeId);
    const size = cake?.sizes.find((entry) => entry.id === item.sizeId);
    if (!cake || !size)
      return "A cake size is no longer available. Choose a valid size or remove it.";
    const result = cakeSizeAvailability(size, pickupDate);
    if (!result.available)
      return `${cake.name} ${size.size}: ${result.message}`;
  }
  return null;
}
