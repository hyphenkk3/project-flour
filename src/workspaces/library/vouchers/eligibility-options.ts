import { COMMON_CATALOGUE_SIZE_LABELS } from "@/engines/vouchers/catalogue-voucher";
import { sortCakeSizesByNumericLabel } from "@/engines/menu/cake-size-order";
import type { LibraryCake } from "@/types/library-cake";
import { listCakes } from "@/workspaces/library/cakes/queries";

export async function loadVoucherEligibilityOptions(): Promise<{
  cakes: Array<Pick<LibraryCake, "id" | "name">>;
  sizeLabels: string[];
}> {
  let cakes: LibraryCake[] = [];
  try {
    cakes = await listCakes();
  } catch {
    cakes = [];
  }
  const labels = new Set<string>(COMMON_CATALOGUE_SIZE_LABELS);
  for (const cake of cakes) {
    for (const size of cake.sizes ?? []) {
      if (size.label?.trim()) labels.add(size.label.trim());
    }
  }
  return {
    cakes: cakes
      .map((cake) => ({ id: cake.id, name: cake.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    sizeLabels: sortCakeSizesByNumericLabel(
      Array.from(labels),
      (label) => label,
    ),
  };
}
