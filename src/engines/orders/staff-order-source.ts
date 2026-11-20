export const STAFF_ORDER_SOURCE_VALUES = [
  "jotform",
  "whatsapp",
  "whitebird_instagram",
  "wee",
  "lex",
  "kin",
  "other",
] as const;

export type StaffOrderSource = (typeof STAFF_ORDER_SOURCE_VALUES)[number];

/** 2026-11-01 00:00 Asia/Kuala_Lumpur, represented as an absolute instant. */
export const JOTFORM_NEW_ORDER_CUTOFF_MS = Date.parse(
  "2026-10-31T16:00:00.000Z",
);

export function isJotformAvailableForNewStaffOrder(
  now: Date | number = Date.now(),
): boolean {
  const timestamp = typeof now === "number" ? now : now.getTime();
  return Number.isFinite(timestamp) && timestamp < JOTFORM_NEW_ORDER_CUTOFF_MS;
}

export function isStaffOrderSource(value: string): value is StaffOrderSource {
  return (STAFF_ORDER_SOURCE_VALUES as readonly string[]).includes(value);
}

export type NormalizedStaffOrderSourceInput =
  | { orderSource: StaffOrderSource; orderSourceOther: string | null }
  | { error: string };

/** Server-side validation used immediately before invoking the create RPC. */
export function normalizeNewStaffOrderSourceInput(
  sourceValue: string,
  otherValue: string,
  now: Date | number = Date.now(),
): NormalizedStaffOrderSourceInput {
  const source = sourceValue.trim();
  const other = otherValue.trim();

  if (!isStaffOrderSource(source)) {
    return { error: "Please choose a valid order source." };
  }
  if (source === "jotform" && !isJotformAvailableForNewStaffOrder(now)) {
    return { error: "Jotform is no longer available for new orders." };
  }
  if (source === "other" && !other) {
    return { error: "Please specify the order source." };
  }
  if (source !== "other" && other) {
    return { error: "A source description is only valid for Other." };
  }

  return {
    orderSource: source,
    orderSourceOther: source === "other" ? other : null,
  };
}
