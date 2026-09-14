import {
  cakePickupDateBounds,
  cartPickupDateBounds,
  isPickupDateAllowedForCake,
  type CustomerPickupWindow,
} from "@/engines/menu/customer-browse";
import { formatBusinessCalendarDate } from "@/lib/dates";

export const CART_NO_COMMON_PICKUP_DATE_MESSAGE =
  "These cakes are not available on the same pickup date. Please remove one of the affected cakes.";

export const CART_PICKUP_INCOMPATIBLE_REVIEW_MESSAGE =
  "Some cakes in your order are not available for the selected pickup date. Please review the availability shown under each cake.";

export type CartPickupCakeInput = {
  cakeId: string;
  monthlyMonths: readonly string[];
  specialWindows: readonly CustomerPickupWindow[];
};

export type CartPickupCakeCompatibility = {
  cakeId: string;
  allowed: boolean;
  availabilityNote: string | null;
  bounds: { min: string; max: string } | null;
};

export type CartPickupCompatibility = {
  hasCommonPickupDate: boolean;
  commonBounds: { min: string; max: string } | null;
  cakes: CartPickupCakeCompatibility[];
  dateLevelMessage: string | null;
};

function isYmd(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()));
}

function uniqueCakes(
  cakes: readonly CartPickupCakeInput[],
): CartPickupCakeInput[] {
  const seen = new Map<string, CartPickupCakeInput>();
  for (const cake of cakes) {
    if (!seen.has(cake.cakeId)) seen.set(cake.cakeId, cake);
  }
  return [...seen.values()];
}

/** Customer-facing window copy from actual membership bounds. */
export function cakePickupAvailabilityLabel(
  bounds: { min: string; max: string } | null,
  selectedYmd: string | null,
): string | null {
  if (!bounds) return null;
  const fromLabel = formatBusinessCalendarDate(bounds.min);
  const untilLabel = formatBusinessCalendarDate(bounds.max);
  if (selectedYmd && isYmd(selectedYmd)) {
    if (selectedYmd < bounds.min) {
      return `Available from ${fromLabel}`;
    }
    if (selectedYmd > bounds.max) {
      return `Available until ${untilLabel}`;
    }
  }
  if (bounds.min === bounds.max) {
    return `Available from ${fromLabel}`;
  }
  return `Available from ${fromLabel} to ${untilLabel}`;
}

export function cartPickupDateLevelMessage(input: {
  hasCommonPickupDate: boolean;
  selectedYmd: string | null;
  invalidCakes: ReadonlyArray<{ bounds: { min: string; max: string } | null }>;
}): string | null {
  if (input.invalidCakes.length === 0) return null;
  if (!input.hasCommonPickupDate) {
    return CART_NO_COMMON_PICKUP_DATE_MESSAGE;
  }

  const selected = input.selectedYmd;
  const laterStarts = input.invalidCakes.filter(
    (cake) => cake.bounds && selected && selected < cake.bounds.min,
  );
  const earlierEnds = input.invalidCakes.filter(
    (cake) => cake.bounds && selected && selected > cake.bounds.max,
  );

  if (laterStarts.length > 0 && earlierEnds.length === 0) {
    const from = laterStarts
      .map((cake) => cake.bounds!.min)
      .sort()
      .at(-1)!;
    const label = formatBusinessCalendarDate(from);
    return `Some cakes in your order are only available from ${label}. Please select a pickup date from ${label} onward.`;
  }
  if (earlierEnds.length > 0 && laterStarts.length === 0) {
    const until = earlierEnds
      .map((cake) => cake.bounds!.max)
      .sort()[0]!;
    const label = formatBusinessCalendarDate(until);
    return `Some cakes in your order are only available until ${label}. Please select a pickup date on or before ${label}.`;
  }
  return CART_PICKUP_INCOMPATIBLE_REVIEW_MESSAGE;
}

/**
 * Every selected cake is checked against its catalogue membership window.
 * A cart is valid only when the selected pickup date is allowed for every cake
 * and those windows share at least one date.
 */
export function evaluateCartPickupCompatibility(input: {
  cakes: readonly CartPickupCakeInput[];
  selectedYmd: string | null;
  earliestYmd: string;
  activeSpecialWindows: readonly CustomerPickupWindow[];
  globalMax?: string | null;
}): CartPickupCompatibility {
  const cakes = uniqueCakes(input.cakes);
  const selected = isYmd(input.selectedYmd) ? input.selectedYmd.trim().slice(0, 10) : null;
  const perCake = cakes.map((cake) => ({
    cakeId: cake.cakeId,
    membership: {
      monthlyMonths: cake.monthlyMonths,
      specialWindows: cake.specialWindows,
    },
    bounds: cakePickupDateBounds(
      cake.monthlyMonths,
      cake.specialWindows,
      input.earliestYmd,
    ),
  }));

  const hasCommonPickupDate =
    perCake.length < 2 ||
    (perCake.every((cake) => cake.bounds) &&
      cartPickupDateBounds(
        perCake.map((cake) => cake.bounds),
        input.earliestYmd,
        input.globalMax ?? null,
      ) !== null);

  const commonBounds =
    perCake.length === 0
      ? null
      : cartPickupDateBounds(
          perCake.map((cake) => cake.bounds),
          input.earliestYmd,
          input.globalMax ?? null,
        );

  const evaluated: CartPickupCakeCompatibility[] = perCake.map((cake) => {
    const allowed =
      !selected ||
      (cake.bounds != null &&
        isPickupDateAllowedForCake(
          selected,
          cake.membership,
          input.activeSpecialWindows,
          input.earliestYmd,
        ));
    return {
      cakeId: cake.cakeId,
      allowed,
      bounds: cake.bounds,
      availabilityNote:
        selected && !allowed
          ? cakePickupAvailabilityLabel(cake.bounds, selected)
          : null,
    };
  });

  const invalidCakes = evaluated.filter((cake) => !cake.allowed);
  const dateLevelMessage = !hasCommonPickupDate
    ? CART_NO_COMMON_PICKUP_DATE_MESSAGE
    : selected
      ? cartPickupDateLevelMessage({
          hasCommonPickupDate,
          selectedYmd: selected,
          invalidCakes,
        })
      : null;

  return {
    hasCommonPickupDate,
    commonBounds: hasCommonPickupDate ? commonBounds : null,
    cakes: evaluated,
    dateLevelMessage,
  };
}

export function cakePickupAvailabilityNotesById(
  result: CartPickupCompatibility,
): Record<string, string> {
  const notes: Record<string, string> = {};
  for (const cake of result.cakes) {
    if (cake.availabilityNote) notes[cake.cakeId] = cake.availabilityNote;
  }
  return notes;
}
