export type CollectionMethodId =
  "celebrate_with_us" | "take_home" | "arrange_transport";

export type CollectionMethod = {
  id: CollectionMethodId;
  emoji: string;
  label: string;
  description: string;
};

export type MockCollectionDate = {
  id: string;
  label: string;
  weekday: string;
  /** ISO date for sorting / keys only — mock calendar. */
  isoDate: string;
};

export type MockCollectionTime = {
  id: string;
  label: string;
};

export const COLLECTION_METHODS: CollectionMethod[] = [
  {
    id: "celebrate_with_us",
    emoji: "🍽",
    label: "Celebrate With Us",
    description: "Enjoy your cake with us at Whitebird.",
  },
  {
    id: "take_home",
    emoji: "🏠",
    label: "Take Home",
    description: "Collect your cake and take it home.",
  },
  {
    id: "arrange_transport",
    emoji: "🚚",
    label: "Arrange Transport",
    description: "We’ll help arrange transport for your cake.",
  },
];

/** Mock collection dates for V0.4-P4 — not live availability. */
export const MOCK_COLLECTION_DATES: MockCollectionDate[] = [
  {
    id: "2026-08-07",
    isoDate: "2026-08-07",
    weekday: "Fri",
    label: "7 August",
  },
  {
    id: "2026-08-08",
    isoDate: "2026-08-08",
    weekday: "Sat",
    label: "8 August",
  },
  {
    id: "2026-08-09",
    isoDate: "2026-08-09",
    weekday: "Sun",
    label: "9 August",
  },
  {
    id: "2026-08-10",
    isoDate: "2026-08-10",
    weekday: "Mon",
    label: "10 August",
  },
  {
    id: "2026-08-11",
    isoDate: "2026-08-11",
    weekday: "Tue",
    label: "11 August",
  },
];

/** Mock time windows — same set for every date in this sprint. */
export const MOCK_COLLECTION_TIMES: MockCollectionTime[] = [
  { id: "11:00", label: "11:00 am" },
  { id: "12:30", label: "12:30 pm" },
  { id: "14:00", label: "2:00 pm" },
  { id: "15:30", label: "3:30 pm" },
  { id: "17:00", label: "5:00 pm" },
];

export type PreorderConfirmation = {
  reference: string;
  cakeId: string;
  cakeName: string;
  sizeId: string;
  sizeLabel: string;
  serves: string;
  priceRm: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  collectionMethodId: CollectionMethodId;
  collectionMethodLabel: string;
  dateId: string;
  dateLabel: string;
  timeId: string;
  timeLabel: string;
};

/** Encode confirmation for the thank-you URL (mock journey only). */
export function encodePreorderConfirmation(
  confirmation: PreorderConfirmation,
): string {
  const json = JSON.stringify(confirmation);
  const base64 =
    typeof btoa === "function"
      ? btoa(json)
      : Buffer.from(json, "utf8").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodePreorderConfirmation(
  encoded: string,
): PreorderConfirmation | null {
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (padded.length % 4)) % 4;
    const base64 = padded + "=".repeat(padLength);
    const json =
      typeof atob === "function"
        ? atob(base64)
        : Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json) as PreorderConfirmation;
  } catch {
    return null;
  }
}

export function createMockOrderReference(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `PRE-${y}${m}${d}-${seq}`;
}

export function getCollectionMethod(
  id: CollectionMethodId,
): CollectionMethod | undefined {
  return COLLECTION_METHODS.find((method) => method.id === id);
}

/** Stable mock confirmation for the connected journey (Amy). */
export const AMY_JOURNEY_CONFIRMATION: PreorderConfirmation = {
  reference: "PRE-20260805-1001",
  cakeId: "chocolate-damour",
  cakeName: "Chocolate D’Amour",
  sizeId: "6-inch",
  sizeLabel: "6 inch",
  serves: "Serves 6–8",
  priceRm: 125,
  customerName: "Amy Chen",
  customerPhone: "9123 4567",
  customerEmail: "amy.chen@email.com",
  collectionMethodId: "take_home",
  collectionMethodLabel: "Take Home",
  dateId: "2026-08-21",
  dateLabel: "Fri, 21 August",
  timeId: "16:00",
  timeLabel: "4:00 pm",
};

/** Stable mock confirmation for Product Review screenshots. */
export const PREVIEW_PREORDER_CONFIRMATION: PreorderConfirmation = {
  reference: "PRE-20260804-4821",
  cakeId: "salted-chocolate",
  cakeName: "Salted Chocolate",
  sizeId: "6-inch",
  sizeLabel: "6 inch",
  serves: "Serves 6–8",
  priceRm: 68,
  customerName: "Amelia Tan",
  customerPhone: "91234567",
  customerEmail: "amelia@example.com",
  collectionMethodId: "celebrate_with_us",
  collectionMethodLabel: "Celebrate With Us",
  dateId: "2026-08-08",
  dateLabel: "Sat, 8 August",
  timeId: "12:30",
  timeLabel: "12:30 pm",
};
