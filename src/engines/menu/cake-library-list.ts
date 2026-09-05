import { cakeSizeNumericValue } from "@/engines/menu/cake-size-order";
import type {
  LibraryCake,
  LibraryCakeStatus,
} from "@/types/library-cake";

export type LibraryCakeSortId =
  | "name_asc"
  | "name_desc"
  | "price_asc"
  | "price_desc"
  | "size_asc"
  | "size_desc"
  | "category_asc"
  | "category_desc"
  | "status_asc"
  | "status_desc"
  | "updated_desc"
  | "updated_asc";

export const DEFAULT_LIBRARY_CAKE_SORT: LibraryCakeSortId = "name_asc";

/** Same lifecycle order as Library cake statuses. Used for Status sorting. */
export const LIBRARY_CAKE_STATUS_ORDER: readonly LibraryCakeStatus[] = [
  "draft",
  "ready_for_release",
  "active",
  "seasonal",
  "retired",
];

export function libraryCakeLowestPrice(
  cake: Pick<LibraryCake, "sizes">,
): number | null {
  if (cake.sizes.length === 0) {
    return null;
  }
  return Math.min(...cake.sizes.map((size) => size.price));
}

export function libraryCakeSmallestSizeValue(
  cake: Pick<LibraryCake, "sizes">,
): number | null {
  if (cake.sizes.length === 0) {
    return null;
  }
  return Math.min(...cake.sizes.map((size) => cakeSizeNumericValue(size.label)));
}

export function compareLibraryCakeNames(
  a: Pick<LibraryCake, "name">,
  b: Pick<LibraryCake, "name">,
): number {
  return a.name.localeCompare(b.name, "en");
}

function statusRank(status: LibraryCakeStatus): number {
  const index = LIBRARY_CAKE_STATUS_ORDER.indexOf(status);
  return index === -1 ? LIBRARY_CAKE_STATUS_ORDER.length : index;
}

function compareNullableNumber(
  a: number | null,
  b: number | null,
  direction: 1 | -1,
): number {
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return 1;
  }
  if (b == null) {
    return -1;
  }
  return (a - b) * direction;
}

function compareThenName(
  primary: number,
  a: Pick<LibraryCake, "name">,
  b: Pick<LibraryCake, "name">,
): number {
  if (primary !== 0) {
    return primary;
  }
  return compareLibraryCakeNames(a, b);
}

export function sortLibraryCakes(
  cakes: readonly LibraryCake[],
  sort: LibraryCakeSortId = DEFAULT_LIBRARY_CAKE_SORT,
): LibraryCake[] {
  const rows = [...cakes];
  rows.sort((a, b) => {
    switch (sort) {
      case "name_asc":
        return compareLibraryCakeNames(a, b);
      case "name_desc":
        return compareLibraryCakeNames(b, a);
      case "price_asc":
        return compareThenName(
          compareNullableNumber(
            libraryCakeLowestPrice(a),
            libraryCakeLowestPrice(b),
            1,
          ),
          a,
          b,
        );
      case "price_desc":
        return compareThenName(
          compareNullableNumber(
            libraryCakeLowestPrice(a),
            libraryCakeLowestPrice(b),
            -1,
          ),
          a,
          b,
        );
      case "size_asc":
        return compareThenName(
          compareNullableNumber(
            libraryCakeSmallestSizeValue(a),
            libraryCakeSmallestSizeValue(b),
            1,
          ),
          a,
          b,
        );
      case "size_desc":
        return compareThenName(
          compareNullableNumber(
            libraryCakeSmallestSizeValue(a),
            libraryCakeSmallestSizeValue(b),
            -1,
          ),
          a,
          b,
        );
      case "category_asc":
        return compareThenName(
          a.categoryName.localeCompare(b.categoryName, "en"),
          a,
          b,
        );
      case "category_desc":
        return compareThenName(
          b.categoryName.localeCompare(a.categoryName, "en"),
          a,
          b,
        );
      case "status_asc":
        return compareThenName(statusRank(a.status) - statusRank(b.status), a, b);
      case "status_desc":
        return compareThenName(statusRank(b.status) - statusRank(a.status), a, b);
      case "updated_desc":
        return compareThenName(
          Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
          a,
          b,
        );
      case "updated_asc":
        return compareThenName(
          Date.parse(a.updatedAt) - Date.parse(b.updatedAt),
          a,
          b,
        );
    }
  });
  return rows;
}
