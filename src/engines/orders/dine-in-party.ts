/**
 * Canonical dine-in venue + party-size rules.
 * Applies only when fulfilment_method = dine_in.
 * Pickup and delivery must not call these validators.
 */

import {
  parseDineInVenue,
  parseGuestCount,
  type DineInVenue,
} from "@/engines/business-calendar/dine-in-hours";

export const WHITEBIRD_COMBINED_TABLE_LIMIT = 6;

export const DINE_IN_VENUE_CUSTOMER_COPY = {
  hyphen: {
    name: "Hyphen",
    level: "Level 1",
    access: null as string | null,
  },
  whitebird: {
    name: "Whitebird",
    level: "Level 2",
    access: "Access via the stairs inside Hyphen on Level 1.",
  },
} as const;

/** Existing project assets have no dedicated Hyphen/Whitebird venue photos. */
export const DINE_IN_VENUE_PHOTO_SRC: Record<DineInVenue, string | null> = {
  hyphen: null,
  whitebird: null,
};

export const DINE_IN_HYPHEN_COMBINE_NOTE =
  "For larger groups, tables can be combined at Hyphen.";

export const DINE_IN_WHITEBIRD_GROUP_SIZE_TITLE =
  "Important — Whitebird group size";

export const DINE_IN_WHITEBIRD_GROUP_SIZE_BODY = [
  "Whitebird tables accommodate up to 6 guests per table and cannot be combined.",
  "For groups above 6 guests, your party will be seated at separate tables, and those tables may not be next to each other.",
  "If you would prefer your group to sit together, we recommend Hyphen, where tables can be combined.",
  "If you are happy with separate seating, you may proceed with your reservation.",
].join(" ");

export const DINE_IN_WHITEBIRD_SPLIT_SEATING_ACK_LABEL =
  "I understand that for groups above 6 guests at Whitebird, tables cannot be combined and my group may be seated at separate tables that may not be next to each other.";

export const DINE_IN_BABY_CHAIR_NOTICE =
  "Baby chair is available on a first-come, first-served basis. Selecting a toddler does not guarantee a baby chair.";

export const DINE_IN_PARTY_ERRORS = {
  venue: "Please choose where you would like to sit.",
  guests: "Please enter how many guests are dining in.",
  invalidCount: "Guest counts must be whole numbers of 0 or more.",
  acknowledgement:
    "Please confirm you understand Whitebird seating for groups above 6 guests.",
} as const;

export type DineInPartyCounts = {
  adultCount: number;
  kidCount: number;
  toddlerCount: number;
  totalGuestCount: number;
};

export type ValidatedDineInParty = DineInPartyCounts & {
  venue: DineInVenue;
  whitebirdSplitSeating: boolean;
  whitebirdSplitSeatingAcknowledged: boolean;
};

export type DineInPartyDraftFields = {
  adultCount: string;
  kidCount: string;
  toddlerCount: string;
  whitebirdSplitSeatingAcknowledged: boolean;
};

export type DineInReservationRpcPayload = {
  venue: DineInVenue;
  adult_count: number;
  kid_count: number;
  toddler_count: number;
  guest_count: number;
  reservation_time: string;
  reservation_note: string | null;
  whitebird_split_seating_acknowledged: boolean;
};

export type DineInPartyValidationResult =
  { ok: true; party: ValidatedDineInParty } | { ok: false; error: string };

function asTrimmed(value: unknown): string {
  return String(value ?? "").trim();
}

export function parseNonNegativeIntCount(value: unknown): number | null {
  const raw = asTrimmed(value);
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function parseOptionalCount(value: unknown, fallback = 0): number | null {
  const raw = asTrimmed(value);
  if (!raw) return fallback;
  return parseNonNegativeIntCount(raw);
}

export function dineInTotalGuestCount(
  adultCount: number,
  kidCount: number,
  toddlerCount: number,
): number {
  return adultCount + kidCount + toddlerCount;
}

export function requiresWhitebirdSplitSeating(
  venue: DineInVenue | string | null | undefined,
  totalGuestCount: number,
): boolean {
  return (
    venue === "whitebird" && totalGuestCount > WHITEBIRD_COMBINED_TABLE_LIMIT
  );
}

export function shouldShowWhitebirdSplitSeatingWarning(
  venue: string,
  totalGuestCount: number,
): boolean {
  return requiresWhitebirdSplitSeating(venue, totalGuestCount);
}

export function shouldRequireWhitebirdSplitSeatingAck(input: {
  venue: string;
  totalGuestCount: number;
  requireAcknowledgement: boolean;
}): boolean {
  return (
    input.requireAcknowledgement &&
    requiresWhitebirdSplitSeating(input.venue, input.totalGuestCount)
  );
}

export function shouldShowBabyChairNotice(toddlerCount: number): boolean {
  return toddlerCount > 0;
}

export function shouldShowHyphenCombineNote(venue: string): boolean {
  return venue === "hyphen";
}

export function parseDineInAcknowledgement(value: unknown): boolean {
  if (value === true) return true;
  const raw = asTrimmed(value).toLowerCase();
  return raw === "on" || raw === "true" || raw === "1" || raw === "yes";
}

export function emptyDineInPartyDraftFields(): DineInPartyDraftFields {
  return {
    adultCount: "",
    kidCount: "",
    toddlerCount: "",
    whitebirdSplitSeatingAcknowledged: false,
  };
}

export function readDineInPartyDraftFields(input: {
  adultCount?: unknown;
  kidCount?: unknown;
  toddlerCount?: unknown;
  guestCount?: unknown;
  whitebirdSplitSeatingAcknowledged?: unknown;
}): DineInPartyDraftFields {
  const adultCount = asTrimmed(input.adultCount);
  const guestCount = asTrimmed(input.guestCount);
  return {
    adultCount: adultCount || guestCount,
    kidCount: asTrimmed(input.kidCount),
    toddlerCount: asTrimmed(input.toddlerCount),
    whitebirdSplitSeatingAcknowledged: parseDineInAcknowledgement(
      input.whitebirdSplitSeatingAcknowledged,
    ),
  };
}

export function derivedGuestCountDraft(fields: DineInPartyDraftFields): string {
  const parsed = parseDineInPartyCounts(fields);
  if (!parsed.ok) return "";
  return String(parsed.counts.totalGuestCount);
}

export function parseDineInPartyCounts(input: {
  adultCount?: unknown;
  kidCount?: unknown;
  toddlerCount?: unknown;
  guestCount?: unknown;
}): { ok: true; counts: DineInPartyCounts } | { ok: false; error: string } {
  const adultRaw = asTrimmed(input.adultCount);
  const kidRaw = asTrimmed(input.kidCount);
  const toddlerRaw = asTrimmed(input.toddlerCount);
  const guestRaw = asTrimmed(input.guestCount);
  const hasBreakdown = Boolean(adultRaw || kidRaw || toddlerRaw);

  if (!hasBreakdown && guestRaw) {
    const asNonNeg = parseNonNegativeIntCount(guestRaw);
    if (asNonNeg == null) {
      return { ok: false, error: DINE_IN_PARTY_ERRORS.invalidCount };
    }
    const total = parseGuestCount(asNonNeg);
    if (total == null) {
      return { ok: false, error: DINE_IN_PARTY_ERRORS.guests };
    }
    return {
      ok: true,
      counts: {
        adultCount: total,
        kidCount: 0,
        toddlerCount: 0,
        totalGuestCount: total,
      },
    };
  }

  if (
    (adultRaw && parseNonNegativeIntCount(adultRaw) == null) ||
    (kidRaw && parseNonNegativeIntCount(kidRaw) == null) ||
    (toddlerRaw && parseNonNegativeIntCount(toddlerRaw) == null)
  ) {
    return { ok: false, error: DINE_IN_PARTY_ERRORS.invalidCount };
  }

  const adultCount = parseOptionalCount(adultRaw, 0);
  const kidCount = parseOptionalCount(kidRaw, 0);
  const toddlerCount = parseOptionalCount(toddlerRaw, 0);
  if (adultCount == null || kidCount == null || toddlerCount == null) {
    return { ok: false, error: DINE_IN_PARTY_ERRORS.invalidCount };
  }

  const totalGuestCount = dineInTotalGuestCount(
    adultCount,
    kidCount,
    toddlerCount,
  );
  if (parseGuestCount(totalGuestCount) == null) {
    return { ok: false, error: DINE_IN_PARTY_ERRORS.guests };
  }

  return {
    ok: true,
    counts: { adultCount, kidCount, toddlerCount, totalGuestCount },
  };
}

export function validateDineInParty(input: {
  venue: unknown;
  adultCount?: unknown;
  kidCount?: unknown;
  toddlerCount?: unknown;
  guestCount?: unknown;
  acknowledged?: unknown;
  requireAcknowledgement: boolean;
}): DineInPartyValidationResult {
  const venue = parseDineInVenue(input.venue);
  if (!venue) {
    return { ok: false, error: DINE_IN_PARTY_ERRORS.venue };
  }

  const parsed = parseDineInPartyCounts(input);
  if (!parsed.ok) return parsed;

  const whitebirdSplitSeating = requiresWhitebirdSplitSeating(
    venue,
    parsed.counts.totalGuestCount,
  );
  const acknowledged = parseDineInAcknowledgement(input.acknowledged);
  if (
    shouldRequireWhitebirdSplitSeatingAck({
      venue,
      totalGuestCount: parsed.counts.totalGuestCount,
      requireAcknowledgement: input.requireAcknowledgement,
    }) &&
    !acknowledged
  ) {
    return { ok: false, error: DINE_IN_PARTY_ERRORS.acknowledgement };
  }

  return {
    ok: true,
    party: {
      venue,
      ...parsed.counts,
      whitebirdSplitSeating,
      whitebirdSplitSeatingAcknowledged: whitebirdSplitSeating && acknowledged,
    },
  };
}

export function dineInPartyFromFormData(formData: FormData) {
  return {
    venue: formData.get("dine_in_venue"),
    adultCount: formData.get("adult_count"),
    kidCount: formData.get("kid_count"),
    toddlerCount: formData.get("toddler_count"),
    guestCount: formData.get("guest_count"),
    acknowledged: formData.get("whitebird_split_seating_acknowledged"),
    reservationTime: asTrimmed(formData.get("reservation_time")),
    reservationNote: asTrimmed(formData.get("reservation_note")) || null,
  };
}

export function validateDineInPartyFromForm(
  formData: FormData,
  requireAcknowledgement: boolean,
): DineInPartyValidationResult {
  const fields = dineInPartyFromFormData(formData);
  return validateDineInParty({
    ...fields,
    requireAcknowledgement,
  });
}

export function buildDineInReservationRpcPayload(input: {
  party: ValidatedDineInParty;
  reservationTime: string;
  reservationNote: string | null;
}): DineInReservationRpcPayload {
  return {
    venue: input.party.venue,
    adult_count: input.party.adultCount,
    kid_count: input.party.kidCount,
    toddler_count: input.party.toddlerCount,
    guest_count: input.party.totalGuestCount,
    reservation_time: input.reservationTime,
    reservation_note: input.reservationNote,
    whitebird_split_seating_acknowledged:
      input.party.whitebirdSplitSeatingAcknowledged,
  };
}

export function formatDineInPartyComposition(
  counts: DineInPartyCounts,
): string {
  return `Adults ${counts.adultCount} · Kids ${counts.kidCount} · Toddlers ${counts.toddlerCount} · Total ${counts.totalGuestCount}`;
}

export function dineInSplitSeatingStaffLabel(
  venue: DineInVenue | string | null | undefined,
  totalGuestCount: number,
): string | null {
  if (!requiresWhitebirdSplitSeating(venue, totalGuestCount)) return null;
  return "Separated tables — Whitebird groups above 6 cannot sit together";
}

export function partyCountsFromReservation(row: {
  adultCount?: number | null;
  kidCount?: number | null;
  toddlerCount?: number | null;
  guestCount: number;
}): DineInPartyCounts {
  const adultCount =
    Number.isInteger(row.adultCount) && (row.adultCount ?? 0) >= 0
      ? Number(row.adultCount)
      : row.guestCount;
  const kidCount =
    Number.isInteger(row.kidCount) && (row.kidCount ?? 0) >= 0
      ? Number(row.kidCount)
      : 0;
  const toddlerCount =
    Number.isInteger(row.toddlerCount) && (row.toddlerCount ?? 0) >= 0
      ? Number(row.toddlerCount)
      : 0;
  const total = dineInTotalGuestCount(adultCount, kidCount, toddlerCount);
  if (total === row.guestCount) {
    return {
      adultCount,
      kidCount,
      toddlerCount,
      totalGuestCount: row.guestCount,
    };
  }
  return {
    adultCount: row.guestCount,
    kidCount: 0,
    toddlerCount: 0,
    totalGuestCount: row.guestCount,
  };
}
