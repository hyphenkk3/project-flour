import { createPublicClient } from "@/lib/supabase/server";
import {
  EMPTY_DINE_IN_VENUE_PHOTOS,
  resolveDineInVenuePhotos,
  type DineInVenuePhotoMap,
} from "@/engines/orders/dine-in-venue-photos";

type VenueLinkRow = {
  venue: string;
  asset_id: string | null;
};

type AssetRow = {
  id: string;
  image_url: string | null;
  alt_text: string | null;
  title: string | null;
  status: string | null;
};

export async function loadDineInVenuePhotos(): Promise<DineInVenuePhotoMap> {
  try {
    const supabase = createPublicClient();
    const { data: links, error: linkError } = await supabase
      .from("dine_in_venue_assets")
      .select("venue, asset_id");

    if (linkError || !links) {
      return EMPTY_DINE_IN_VENUE_PHOTOS;
    }

    const assetIds = (links as VenueLinkRow[])
      .map((row) => row.asset_id)
      .filter((id): id is string => Boolean(id));

    if (assetIds.length === 0) {
      return EMPTY_DINE_IN_VENUE_PHOTOS;
    }

    const { data: assets, error: assetError } = await supabase
      .from("library_assets")
      .select("id, image_url, alt_text, title, status")
      .in("id", assetIds)
      .eq("status", "active");

    if (assetError || !assets) {
      return EMPTY_DINE_IN_VENUE_PHOTOS;
    }

    const byId = new Map(
      (assets as AssetRow[]).map((asset) => [asset.id, asset]),
    );

    return resolveDineInVenuePhotos(
      (links as VenueLinkRow[]).map((row) => {
        const asset = row.asset_id ? byId.get(row.asset_id) : undefined;
        return {
          venue: row.venue,
          imageUrl: asset?.image_url ?? null,
          altText: asset?.alt_text ?? null,
          title: asset?.title ?? null,
          status: asset?.status ?? null,
        };
      }),
    );
  } catch {
    return EMPTY_DINE_IN_VENUE_PHOTOS;
  }
}
