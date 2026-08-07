import type { StatusTone } from "@/lib/design-tokens";
import type {
  LibraryCakeCategory,
  LibraryCakeStatus,
} from "@/types/library-cake";
import type {
  LibraryAssetKind,
  LibraryAssetStatus,
} from "@/types/library-asset";
import type { LibraryPromotionStatus } from "@/types/library-promotion";
import type {
  LibraryVoucherStatus,
  LibraryVoucherType,
} from "@/types/library-voucher";

export const LIBRARY_CAKE_STATUSES: readonly LibraryCakeStatus[] = [
  "draft",
  "ready_for_release",
  "active",
  "seasonal",
  "retired",
] as const;

export const LIBRARY_CAKE_CATEGORIES: readonly LibraryCakeCategory[] = [
  "celebration",
  "classic",
  "seasonal",
  "specialty",
  "other",
] as const;

export const LIBRARY_PROMOTION_STATUSES: readonly LibraryPromotionStatus[] = [
  "draft",
  "active",
  "scheduled",
  "expired",
  "retired",
] as const;

export const LIBRARY_VOUCHER_STATUSES: readonly LibraryVoucherStatus[] = [
  "draft",
  "active",
  "scheduled",
  "expired",
  "retired",
] as const;

export const LIBRARY_VOUCHER_TYPES: readonly LibraryVoucherType[] = [
  "fixed_amount",
  "percentage",
  "complimentary",
] as const;

export const LIBRARY_ASSET_KINDS: readonly LibraryAssetKind[] = [
  "homepage_hero",
  "collection_cover",
  "promotional_banner",
  "cake_photo",
  "general",
] as const;

export const LIBRARY_ASSET_STATUSES: readonly LibraryAssetStatus[] = [
  "draft",
  "active",
  "retired",
] as const;

export function cakeStatusLabel(status: LibraryCakeStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "ready_for_release":
      return "Ready for Release";
    case "active":
      return "Active";
    case "seasonal":
      return "Seasonal";
    case "retired":
      return "Retired";
  }
}

export function cakeCategoryLabel(category: LibraryCakeCategory): string {
  switch (category) {
    case "celebration":
      return "Celebration";
    case "classic":
      return "Classic";
    case "seasonal":
      return "Seasonal";
    case "specialty":
      return "Specialty";
    case "other":
      return "Other";
  }
}

export function promotionStatusLabel(status: LibraryPromotionStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "active":
      return "Active";
    case "scheduled":
      return "Scheduled";
    case "expired":
      return "Expired";
    case "retired":
      return "Retired";
  }
}

export function voucherStatusLabel(status: LibraryVoucherStatus): string {
  return promotionStatusLabel(status);
}

export function voucherTypeLabel(type: LibraryVoucherType): string {
  switch (type) {
    case "fixed_amount":
      return "Fixed amount (RM)";
    case "percentage":
      return "Percentage";
    case "complimentary":
      return "Complimentary";
  }
}

export function assetKindLabel(kind: LibraryAssetKind): string {
  switch (kind) {
    case "homepage_hero":
      return "Homepage Hero";
    case "collection_cover":
      return "Collection Cover";
    case "promotional_banner":
      return "Promotional Banner";
    case "cake_photo":
      return "Cake Photo";
    case "general":
      return "General";
  }
}

export function assetStatusLabel(status: LibraryAssetStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "active":
      return "Active";
    case "retired":
      return "Retired";
  }
}

export function libraryStatusTone(status: string): StatusTone {
  switch (status) {
    case "active":
    case "seasonal":
      return "success";
    case "ready_for_release":
    case "scheduled":
      return "info";
    case "draft":
      return "neutral";
    case "expired":
      return "warning";
    case "retired":
      return "danger";
    default:
      return "neutral";
  }
}

export function formatLibraryMoney(amount: number): string {
  return `RM${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
}

export function formatCakeSizePrices(
  sizes: Array<{ label: string; price: number }>,
): string {
  if (sizes.length === 0) {
    return "No sizes";
  }
  return sizes
    .map((size) => `${size.label} — ${formatLibraryMoney(size.price)}`)
    .join(" · ");
}

export function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export function parseOptionalDate(
  value: FormDataEntryValue | null,
): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  return text;
}

export function parseNonNegativeNumber(
  value: FormDataEntryValue | null,
  fallback = 0,
): number {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) {
    return fallback;
  }
  return amount;
}
