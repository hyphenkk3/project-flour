import {
  parseDineInVenue,
  type DineInVenue,
} from "@/engines/business-calendar/dine-in-hours";
import { DINE_IN_VENUE_CUSTOMER_COPY } from "@/engines/orders/dine-in-party";

export type DineInVenuePhoto = {
  src: string;
  alt: string;
};

export type DineInVenuePhotoMap = Record<DineInVenue, DineInVenuePhoto | null>;

export const EMPTY_DINE_IN_VENUE_PHOTOS: DineInVenuePhotoMap = {
  hyphen: null,
  whitebird: null,
};

export type DineInVenueAssetLink = {
  venue: string;
  imageUrl: string | null;
  altText: string | null;
  title: string | null;
  status: string | null;
};

export function resolveDineInVenuePhotos(
  links: readonly DineInVenueAssetLink[],
): DineInVenuePhotoMap {
  const next: DineInVenuePhotoMap = { ...EMPTY_DINE_IN_VENUE_PHOTOS };

  for (const link of links) {
    const venue = parseDineInVenue(link.venue);
    if (!venue) continue;
    if (link.status !== "active") continue;
    const src = link.imageUrl?.trim() ?? "";
    if (!src) continue;
    const alt =
      link.altText?.trim() ||
      link.title?.trim() ||
      DINE_IN_VENUE_CUSTOMER_COPY[venue].name;
    next[venue] = { src, alt };
  }

  return next;
}

export function dineInVenuePhoto(
  photos: DineInVenuePhotoMap | null | undefined,
  venue: DineInVenue,
): DineInVenuePhoto | null {
  return photos?.[venue] ?? null;
}
