"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { createClient } from "@/lib/supabase/server";
import type {
  LibraryCakeInput,
  LibraryCakeSizeInput,
  LibraryCakeStatus,
} from "@/types/library-cake";
import type { LibraryActionState } from "@/workspaces/library/action-state";
import {
  getCakeById,
  listCakeCategories,
  listCakeTags,
} from "@/workspaces/library/cakes/queries";
import {
  emptyToNull,
  LIBRARY_CAKE_STATUSES,
  parseNonNegativeNumber,
} from "@/workspaces/library/labels";
import { parsePreorderDays } from "@/engines/preorder/lead";
import {
  parseCakeCategoryAssignmentIds,
} from "@/engines/menu/cake-categories";
import {
  isMissingCakeTagAssignmentSchema,
  parseCakeTagAssignmentIds,
} from "@/engines/menu/cake-tags";
import {
  parsePopularCakesSortOrder,
  planPopularCakesChange,
  type PopularCakesPlanItem,
  type PopularCakesSortable,
} from "@/engines/menu/homepage-popular-cakes";

async function requireLibraryStaff() {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }
  return staff;
}

function parseLines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseSizes(formData: FormData): LibraryCakeSizeInput[] | string {
  const ids = formData.getAll("size_id").map((value) => String(value).trim());
  const labels = formData
    .getAll("size_label")
    .map((value) => String(value).trim());
  const prices = formData.getAll("size_price");
  const preorderDaysRaw = formData.getAll("size_preorder_days");

  const sizes: LibraryCakeSizeInput[] = [];

  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index] ?? "";
    const priceRaw = String(prices[index] ?? "").trim();
    const id = ids[index] ? ids[index] : null;
    const daysRaw = String(preorderDaysRaw[index] ?? "").trim();

    if (!label && !priceRaw && !daysRaw) {
      continue;
    }
    if (!label) {
      return 'Enter a size for each row (e.g. 6").';
    }
    if (!priceRaw) {
      return `Enter a price for size “${label}”.`;
    }

    const preorderDays = parsePreorderDays(daysRaw || "2");
    if (preorderDays == null) {
      return `Preorder days for size “${label}” must be a whole number of at least 1.`;
    }

    const price = parseNonNegativeNumber(priceRaw);
    sizes.push({
      id,
      label,
      price,
      sortOrder: sizes.length,
      preorderDays,
    });
  }

  if (sizes.length === 0) {
    return "Add at least one size with a label and price.";
  }

  return sizes;
}

async function parseCakeInput(
  formData: FormData,
  options: {
    currentCategoryIds?: readonly string[];
    currentTagIds?: readonly string[];
  } = {},
): Promise<LibraryCakeInput | string> {
  const name = String(formData.get("name") ?? "").trim();
  const description = emptyToNull(formData.get("description"));
  const sharingGuide = emptyToNull(formData.get("sharing_guide"));
  const bakeryNotes = emptyToNull(formData.get("bakery_notes"));
  const status = String(
    formData.get("status") ?? "",
  ).trim() as LibraryCakeStatus;
  const allergens = parseLines(formData.get("allergens"));
  const sizes = parseSizes(formData);
  if (typeof sizes === "string") {
    return sizes;
  }

  const showInPopularCakes =
    String(formData.get("show_in_popular_cakes") ?? "").trim() === "on";
  const parsedOrder = showInPopularCakes
    ? parsePopularCakesSortOrder(
        String(formData.get("popular_cakes_sort_order") ?? ""),
      )
    : null;
  if (typeof parsedOrder === "string") {
    return parsedOrder;
  }

  if (!name) return "Name is required.";

  const parsedIds = parseCakeCategoryAssignmentIds(
    formData.getAll("category_ids").map((value) => String(value)),
  );
  if (typeof parsedIds === "string") {
    return parsedIds;
  }

  const categories = await listCakeCategories();
  const current = new Set(
    (options.currentCategoryIds ?? []).map((id) => id.trim()).filter(Boolean),
  );
  for (const categoryId of parsedIds) {
    const match = categories.find((row) => row.id === categoryId);
    if (!match) {
      return "Choose a valid category.";
    }
    if (!match.isActive && !current.has(match.id)) {
      return "Choose an active category.";
    }
  }

  const parsedTagIds = parseCakeTagAssignmentIds(
    formData.getAll("tag_ids").map((value) => String(value)),
  );
  const tags = await listCakeTags();
  const currentTags = new Set(
    (options.currentTagIds ?? []).map((id) => id.trim()).filter(Boolean),
  );
  for (const tagId of parsedTagIds) {
    const match = tags.find((row) => row.id === tagId);
    if (!match) {
      return "Choose a valid tag.";
    }
    if (!match.isActive && !currentTags.has(match.id)) {
      return "Choose an active tag.";
    }
  }
  if (!LIBRARY_CAKE_STATUSES.includes(status)) {
    return "Choose a valid status.";
  }

  return {
    name,
    categoryIds: parsedIds,
    tagIds: parsedTagIds,
    description,
    sharingGuide,
    allergens,
    bakeryNotes,
    status,
    showInPopularCakes,
    popularCakesSortOrder: showInPopularCakes ? parsedOrder : null,
    sizes,
    photos: [],
  };
}

async function replaceCakeCategoryAssignments(
  cakeId: string,
  categoryIds: readonly string[],
) {
  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("library_cake_category_assignments")
    .delete()
    .eq("cake_id", cakeId);
  if (deleteError) {
    throw new Error(deleteError.message);
  }
  if (categoryIds.length === 0) {
    return;
  }
  const { error } = await supabase.from("library_cake_category_assignments").insert(
    categoryIds.map((categoryId, index) => ({
      cake_id: cakeId,
      category_id: categoryId,
      sort_order: index + 1,
    })),
  );
  if (error) {
    throw new Error(error.message);
  }
}

async function replaceCakeTagAssignments(
  cakeId: string,
  tagIds: readonly string[],
) {
  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("library_cake_tag_assignments")
    .delete()
    .eq("cake_id", cakeId);
  if (deleteError) {
    if (isMissingCakeTagAssignmentSchema(deleteError.message)) {
      return;
    }
    throw new Error(deleteError.message);
  }
  if (tagIds.length === 0) {
    return;
  }
  const { error } = await supabase.from("library_cake_tag_assignments").insert(
    tagIds.map((tagId, index) => ({
      cake_id: cakeId,
      tag_id: tagId,
      sort_order: index + 1,
    })),
  );
  if (error) {
    throw new Error(error.message);
  }
}

const NEW_POPULAR_CAKES_PLAN_ID = "__new_cake__";

function mapPopularCakesRow(row: {
  id: string;
  name: string;
  show_in_popular_cakes?: boolean | null;
  popular_cakes_sort_order?: number | string | null;
}): PopularCakesSortable {
  const rawOrder = row.popular_cakes_sort_order;
  const order =
    rawOrder == null || rawOrder === ""
      ? null
      : Number(rawOrder);
  return {
    id: row.id,
    name: row.name,
    showInPopularCakes: row.show_in_popular_cakes === true,
    popularCakesSortOrder: Number.isInteger(order) ? order : null,
  };
}

async function listSelectedPopularCakes(): Promise<PopularCakesSortable[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_cakes")
    .select("id, name, show_in_popular_cakes, popular_cakes_sort_order")
    .eq("show_in_popular_cakes", true);
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as Array<Parameters<typeof mapPopularCakesRow>[0]>).map(
    mapPopularCakesRow,
  );
}

async function applyPopularCakesUpdates(
  updates: readonly PopularCakesPlanItem[],
  staffId: string,
  skipCakeId?: string,
) {
  const supabase = await createClient();
  for (const update of updates) {
    if (update.id === skipCakeId) continue;
    const { error } = await supabase
      .from("library_cakes")
      .update({
        show_in_popular_cakes: update.showInPopularCakes,
        popular_cakes_sort_order: update.popularCakesSortOrder,
        updated_by: staffId,
      })
      .eq("id", update.id);
    if (error) {
      throw new Error(error.message);
    }
  }
}

async function planCakePopularCakes(
  cake: PopularCakesSortable,
  showInPopularCakes: boolean,
  requestedOrder: number | null,
): Promise<PopularCakesPlanItem[] | string> {
  const selected = await listSelectedPopularCakes();
  const plan = planPopularCakesChange({
    selected,
    cake,
    showInPopularCakes,
    requestedOrder,
  });
  if (!plan.ok) {
    return plan.error;
  }
  return plan.updates;
}

/**
 * Identity-preserving size reconciliation.
 * Existing size IDs are updated in place so order_items FKs stay valid.
 * Unreferenced removed sizes may be deleted; referenced sizes are blocked.
 */
async function reconcileCakeSizes(
  cakeId: string,
  sizes: LibraryCakeSizeInput[],
) {
  const supabase = await createClient();

  const { data: existingRows, error: existingError } = await supabase
    .from("library_cake_sizes")
    .select("id")
    .eq("cake_id", cakeId);
  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingIds = new Set(
    (existingRows ?? []).map((row) => String(row.id)),
  );
  const keptIds = new Set<string>();

  for (const size of sizes) {
    const sizeId = size.id?.trim() || null;
    if (sizeId) {
      if (!existingIds.has(sizeId)) {
        throw new Error(
          "One of the cake sizes no longer belongs to this cake. Reload and try again.",
        );
      }
      const { error } = await supabase
        .from("library_cake_sizes")
        .update({
          label: size.label,
          price: size.price,
          sort_order: size.sortOrder,
          preorder_days: size.preorderDays,
        })
        .eq("id", sizeId)
        .eq("cake_id", cakeId);
      if (error) {
        throw new Error(error.message);
      }
      keptIds.add(sizeId);
      continue;
    }

    const { error } = await supabase.from("library_cake_sizes").insert({
      cake_id: cakeId,
      label: size.label,
      serves: null,
      price: size.price,
      sort_order: size.sortOrder,
      preorder_days: size.preorderDays,
    });
    if (error) {
      throw new Error(error.message);
    }
  }

  const removedIds = [...existingIds].filter((id) => !keptIds.has(id));
  if (removedIds.length === 0) {
    return;
  }

  const { data: referencedRows, error: referencedError } = await supabase
    .from("order_items")
    .select("cake_size_id")
    .in("cake_size_id", removedIds);
  if (referencedError) {
    throw new Error(referencedError.message);
  }

  const referencedIds = new Set(
    (referencedRows ?? []).map((row) => String(row.cake_size_id)),
  );
  if (referencedIds.size > 0) {
    throw new Error(
      "A size you removed is used on existing orders, so it cannot be deleted. Keep that size on the cake (you may still change its current Library price), or set the cake inactive if it should leave the storefront.",
    );
  }

  const { error: deleteError } = await supabase
    .from("library_cake_sizes")
    .delete()
    .eq("cake_id", cakeId)
    .in("id", removedIds);
  if (deleteError) {
    throw new Error(deleteError.message);
  }
}

async function saveCakeChildren(cakeId: string, sizes: LibraryCakeSizeInput[]) {
  await reconcileCakeSizes(cakeId, sizes);
}

export async function createCakeAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const staff = await requireLibraryStaff();
  const parsed = await parseCakeInput(formData);
  if (typeof parsed === "string") {
    return { error: parsed };
  }

  const supabase = await createClient();
  let popularUpdates: PopularCakesPlanItem[];
  try {
    const planned = await planCakePopularCakes(
      {
        id: NEW_POPULAR_CAKES_PLAN_ID,
        name: parsed.name,
        showInPopularCakes: false,
        popularCakesSortOrder: null,
      },
      parsed.showInPopularCakes,
      parsed.popularCakesSortOrder,
    );
    if (typeof planned === "string") {
      return { error: planned };
    }
    popularUpdates = planned;
  } catch (orderError) {
    return {
      error:
        orderError instanceof Error
          ? orderError.message
          : "Could not save Popular Cakes order.",
    };
  }
  const thisCakePlan = popularUpdates.find(
    (update) => update.id === NEW_POPULAR_CAKES_PLAN_ID,
  );
  const { data, error } = await supabase
    .from("library_cakes")
    .insert({
      name: parsed.name,
      category_id: parsed.categoryIds[0] ?? null,
      description: parsed.description,
      sharing_guide: parsed.sharingGuide,
      allergens: parsed.allergens,
      bakery_notes: parsed.bakeryNotes,
      status: parsed.status,
      show_in_popular_cakes: thisCakePlan?.showInPopularCakes ?? false,
      popular_cakes_sort_order: thisCakePlan?.popularCakesSortOrder ?? null,
      created_by: staff.id,
      updated_by: staff.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  try {
    await saveCakeChildren(data.id, parsed.sizes);
    await replaceCakeCategoryAssignments(data.id, parsed.categoryIds);
    await replaceCakeTagAssignments(data.id, parsed.tagIds);
  } catch (childError) {
    return {
      error:
        childError instanceof Error
          ? childError.message
          : "Could not save sizes.",
    };
  }

  try {
    await applyPopularCakesUpdates(
      popularUpdates,
      staff.id,
      NEW_POPULAR_CAKES_PLAN_ID,
    );
  } catch (orderError) {
    return {
      error:
        orderError instanceof Error
          ? orderError.message
          : "Could not save Popular Cakes order.",
    };
  }

  revalidatePath("/library/cakes");
  revalidatePath("/");
  redirect(`/library/cakes/${data.id}`);
}

export async function updateCakeAction(
  id: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const staff = await requireLibraryStaff();
  const current = await getCakeById(id);
  const parsed = await parseCakeInput(formData, {
    currentCategoryIds: current?.categories.map((row) => row.id) ?? [],
    currentTagIds: current?.tags?.map((row) => row.id) ?? [],
  });
  if (typeof parsed === "string") {
    return { error: parsed };
  }

  const supabase = await createClient();
  let popularUpdates: PopularCakesPlanItem[];
  try {
    const planned = await planCakePopularCakes(
      {
        id,
        name: parsed.name,
        showInPopularCakes: current?.showInPopularCakes ?? false,
        popularCakesSortOrder: current?.popularCakesSortOrder ?? null,
      },
      parsed.showInPopularCakes,
      parsed.popularCakesSortOrder,
    );
    if (typeof planned === "string") {
      return { error: planned };
    }
    popularUpdates = planned;
  } catch (orderError) {
    return {
      error:
        orderError instanceof Error
          ? orderError.message
          : "Could not save Popular Cakes order.",
    };
  }
  const thisCakePlan = popularUpdates.find((update) => update.id === id);
  const { error } = await supabase
    .from("library_cakes")
    .update({
      name: parsed.name,
      category_id: parsed.categoryIds[0] ?? null,
      description: parsed.description,
      sharing_guide: parsed.sharingGuide,
      allergens: parsed.allergens,
      bakery_notes: parsed.bakeryNotes,
      status: parsed.status,
      show_in_popular_cakes: thisCakePlan?.showInPopularCakes ?? false,
      popular_cakes_sort_order: thisCakePlan?.popularCakesSortOrder ?? null,
      updated_by: staff.id,
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  try {
    await saveCakeChildren(id, parsed.sizes);
    await replaceCakeCategoryAssignments(id, parsed.categoryIds);
    await replaceCakeTagAssignments(id, parsed.tagIds);
  } catch (childError) {
    return {
      error:
        childError instanceof Error
          ? childError.message
          : "Could not save sizes.",
    };
  }

  try {
    await applyPopularCakesUpdates(popularUpdates, staff.id, id);
  } catch (orderError) {
    return {
      error:
        orderError instanceof Error
          ? orderError.message
          : "Could not save Popular Cakes order.",
    };
  }

  revalidatePath("/library/cakes");
  revalidatePath(`/library/cakes/${id}`);
  revalidatePath(`/library/cakes/${id}/edit`);
  revalidatePath("/");
  redirect(`/library/cakes/${id}`);
}

export async function updateCakePopularCakesFromLibraryAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const staff = await requireLibraryStaff();
  const cakeId = String(formData.get("cake_id") ?? "").trim();
  if (!cakeId) {
    return { error: "Choose a cake to update Popular Cakes." };
  }

  const showInPopularCakes =
    String(formData.get("show_in_popular_cakes") ?? "").trim() === "on";
  const parsedOrder = showInPopularCakes
    ? parsePopularCakesSortOrder(
        String(formData.get("popular_cakes_sort_order") ?? ""),
      )
    : null;
  if (typeof parsedOrder === "string") {
    return { error: parsedOrder };
  }

  const current = await getCakeById(cakeId);
  if (!current) {
    return { error: "That cake is no longer in the Cake Library." };
  }

  let updates: PopularCakesPlanItem[];
  try {
    const planned = await planCakePopularCakes(
      {
        id: current.id,
        name: current.name,
        showInPopularCakes: current.showInPopularCakes,
        popularCakesSortOrder: current.popularCakesSortOrder,
      },
      showInPopularCakes,
      parsedOrder,
    );
    if (typeof planned === "string") {
      return { error: planned };
    }
    updates = planned;
  } catch (orderError) {
    return {
      error:
        orderError instanceof Error
          ? orderError.message
          : "Could not save Popular Cakes order.",
    };
  }

  try {
    await applyPopularCakesUpdates(updates, staff.id);
  } catch (orderError) {
    return {
      error:
        orderError instanceof Error
          ? orderError.message
          : "Could not save Popular Cakes order.",
    };
  }

  revalidatePath("/library/cakes");
  revalidatePath(`/library/cakes/${cakeId}`);
  revalidatePath(`/library/cakes/${cakeId}/edit`);
  revalidatePath("/");
  return { error: null };
}

export async function deleteCakeAction(id: string): Promise<void> {
  await requireLibraryStaff();
  const supabase = await createClient();
  const { error } = await supabase.from("library_cakes").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/library/cakes");
  revalidatePath("/");
  redirect("/library/cakes");
}
