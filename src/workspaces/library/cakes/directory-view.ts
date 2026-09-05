import {
  DEFAULT_LIBRARY_CAKE_SORT,
  sortLibraryCakes,
  type LibraryCakeSortId,
} from "@/engines/menu/cake-library-list";
import { libraryPhotosHaveCoverage } from "@/engines/menu/cake-photos";
import type { LibraryCake, LibraryCakeStatus } from "@/types/library-cake";

export type LibraryCakeCategoryFilter = string;
export type LibraryCakeStatusFilter = LibraryCakeStatus | "all";
export type LibraryCakePhotoFilter = "all" | "has_photos" | "missing_photos";

export type LibraryCakeDirectoryOptions = {
  query?: string;
  category?: LibraryCakeCategoryFilter;
  status?: LibraryCakeStatusFilter;
  photos?: LibraryCakePhotoFilter;
  sort?: LibraryCakeSortId;
};

function cakeHasPhotoCoverage(cake: LibraryCake): boolean {
  return libraryPhotosHaveCoverage(
    (cake.photos ?? []).map((photo) => ({ url: photo.imageUrl })),
  );
}

export function filterLibraryCakes(
  cakes: readonly LibraryCake[],
  options: LibraryCakeDirectoryOptions = {},
): LibraryCake[] {
  const query = options.query?.trim().toLowerCase() ?? "";
  const category = options.category ?? "all";
  const status = options.status ?? "all";
  const photos = options.photos ?? "all";

  return cakes.filter((cake) => {
    if (category !== "all" && cake.categoryId !== category) {
      return false;
    }
    if (status !== "all" && cake.status !== status) {
      return false;
    }
    if (photos === "has_photos" && !cakeHasPhotoCoverage(cake)) {
      return false;
    }
    if (photos === "missing_photos" && cakeHasPhotoCoverage(cake)) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      cake.name.toLowerCase().includes(query) ||
      cake.categoryName.toLowerCase().includes(query)
    );
  });
}

export function applyLibraryCakeDirectory(
  cakes: readonly LibraryCake[],
  options: LibraryCakeDirectoryOptions = {},
): LibraryCake[] {
  return sortLibraryCakes(filterLibraryCakes(cakes, options), options.sort);
}

export { DEFAULT_LIBRARY_CAKE_SORT };
export type { LibraryCakeSortId };
