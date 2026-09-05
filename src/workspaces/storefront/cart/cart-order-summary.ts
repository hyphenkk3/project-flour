import { malaysiaPreorderBusinessDate } from "@/engines/preorder/business-date";
import {
  cartEarliestCollectionDate,
  parsePreorderDays,
  preorderCartLineId,
  readPreorderDays,
} from "@/engines/preorder/lead";
import type {
  CollectionDateEvaluation,
  PreorderCartLine,
} from "@/engines/preorder/types";
import { evaluateCollectionDate } from "@/engines/preorder/validate";
import { formatShortBusinessDate } from "@/lib/dates";
import type { StorefrontCake } from "@/types/storefront";
import { storefrontPhotoForSize } from "@/workspaces/storefront/catalog/cake-photo-map";
import {
  cakeCardPreorderBadgeTone,
  formatPreorderRequirement,
  type CakeCardPreorderBadgeTone,
} from "@/workspaces/storefront/catalog/pricing";
import type {
  PreorderDraft,
  PreorderDraftItem,
  PreorderDraftSizeChoice,
} from "@/workspaces/storefront/checkout/preorder-draft";

function toneForDays(days: number): CakeCardPreorderBadgeTone {
  return (
    cakeCardPreorderBadgeTone({
      sizes: [
        {
          id: "summary",
          cakeId: "summary",
          size: '6"',
          price: 0,
          sortOrder: 0,
          preorderDays: days,
        },
      ],
    }) ?? "standard"
  );
}

export function draftPreorderLines(
  items: readonly PreorderDraftItem[],
): PreorderCartLine[] {
  return items.map((item) => ({
    lineId: preorderCartLineId(item.cakeId, item.sizeId),
    cakeId: item.cakeId,
    cakeSizeId: item.sizeId,
    cakeName: item.cakeName,
    sizeLabel: item.sizeLabel,
    quantity: item.quantity,
    preorderDays: readPreorderDays(item.preorderDays),
  }));
}

/** Per-line display label from configured size lead time. */
export function draftLinePreorderLabel(
  item: Pick<PreorderDraftItem, "preorderDays">,
): string | null {
  const days = parsePreorderDays(item.preorderDays);
  if (days == null) return null;
  return formatPreorderRequirement(days);
}

/**
 * Strongest (latest) preorder requirement across cart lines.
 * Display only. Does not change validation or selected collection date.
 */
export function draftStrongestPreorder(items: readonly PreorderDraftItem[]): {
  days: number | null;
  label: string | null;
  tone: CakeCardPreorderBadgeTone | null;
  varies: boolean;
} {
  const days = items
    .map((item) => parsePreorderDays(item.preorderDays))
    .filter((value): value is number => value != null);
  if (days.length === 0) {
    return { days: null, label: null, tone: null, varies: false };
  }
  const max = Math.max(...days);
  const unique = new Set(days);
  return {
    days: max,
    label: formatPreorderRequirement(max),
    tone: toneForDays(max),
    varies: unique.size > 1,
  };
}

/** Earliest valid collection date for the current cart lines (DAY 0 model). */
export function draftEarliestCollectionYmd(
  items: readonly PreorderDraftItem[],
  at: Date = new Date(),
): string | null {
  if (items.length === 0) return null;
  const businessDate = malaysiaPreorderBusinessDate(at);
  return cartEarliestCollectionDate(draftPreorderLines(items), businessDate)
    .earliestYmd;
}

export function formatCartCollectionDate(ymd: string | null | undefined): string | null {
  const key = ymd?.trim().slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  return formatShortBusinessDate(key);
}

/**
 * Stay in the current catalogue/collection when already browsing.
 * Cake detail and other storefront pages return to /browse.
 * Does not write the draft.
 */
export function continueOrderingHref(pathname: string | null | undefined): string {
  const path = pathname?.trim() ?? "";
  if (path === "/browse" || path === "/order") return path;
  if (path.startsWith("/order/collection/")) return path;
  return "/browse";
}

/** Live catalogue sizes when loaded; otherwise the additive draft snapshot. */
export function draftItemSizeChoices(
  item: PreorderDraftItem,
  cake: StorefrontCake | null | undefined,
): PreorderDraftSizeChoice[] {
  if (cake && cake.sizes.length > 0) {
    return cake.sizes.map((size) => ({
      id: size.id,
      size: size.size,
      price: size.price,
      preorderDays: size.preorderDays,
      imageUrl:
        storefrontPhotoForSize(cake.photos, size.id)?.url ??
        cake.image ??
        undefined,
    }));
  }
  return item.sizeChoices ?? [];
}

export function draftItemShowsSizeEditor(
  item: PreorderDraftItem,
  cake: StorefrontCake | null | undefined,
): boolean {
  return draftItemSizeChoices(item, cake).length > 1;
}

/**
 * Preorder-lead evaluation of the currently selected collection date.
 * Does not write pickupDate. Operating/closure/capacity remain checkout's.
 */
export function evaluateDraftSelectedCollectionDate(
  draft: Pick<PreorderDraft, "pickupDate" | "items">,
  at: Date = new Date(),
): CollectionDateEvaluation | null {
  const selected = draft.pickupDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selected) || draft.items.length === 0) {
    return null;
  }
  return evaluateCollectionDate({
    selectedYmd: selected,
    businessDate: malaysiaPreorderBusinessDate(at),
    lines: draftPreorderLines(draft.items),
    operatingOpen: true,
    closed: false,
    inCatalogue: true,
  });
}

export function isDraftCheckoutBlockedByCollectionDate(
  draft: Pick<PreorderDraft, "pickupDate" | "items">,
  at: Date = new Date(),
): boolean {
  const evaluation = evaluateDraftSelectedCollectionDate(draft, at);
  return Boolean(evaluation && !evaluation.valid);
}

export function cartInvalidCollectionDateCopy(
  draft: Pick<PreorderDraft, "pickupDate" | "items">,
  evaluation: CollectionDateEvaluation,
): {
  title: string;
  explanation: string;
  earliestLabel: string | null;
} {
  const selectedLabel = formatCartCollectionDate(draft.pickupDate);
  const earliestLabel = formatCartCollectionDate(evaluation.earliestYmd);
  const lines = draftPreorderLines(draft.items);
  const blockingIds = new Set(evaluation.blockingLineIds);
  const blocking = lines.filter((line) => blockingIds.has(line.lineId));
  const first = blocking[0] ?? lines[0];
  const requirement = first
    ? formatPreorderRequirement(first.preorderDays)
    : null;
  const explanation =
    first && selectedLabel && requirement
      ? `${first.cakeName} ${first.sizeLabel} requires ${requirement}, so ${selectedLabel} is no longer available for this order.`
      : "Your selected date is no longer available for this order.";
  return {
    title: "Your collection date needs updating",
    explanation,
    earliestLabel,
  };
}
