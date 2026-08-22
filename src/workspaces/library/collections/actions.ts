"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isCatalogueExpired,
  isEffectivelyArchived,
} from "@/engines/menu/customer-browse";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { toBusinessDateKey } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { LibraryActionState } from "@/workspaces/library/action-state";
import {
  CATALOGUE_ARCHIVED_QUERY,
  CATALOGUE_COPIED_QUERY,
  CATALOGUE_PUBLISHED_QUERY,
  CATALOGUE_RESTORED_QUERY,
  CATALOGUE_PAST_MENU_QUERY,
  CATALOGUE_UNPUBLISHED_QUERY,
  CATALOGUE_UPDATED_QUERY,
  catalogueArchiveBlockedMessage,
  catalogueCopySelectionError,
  catalogueInsertRow,
  copyCatalogueMembershipRows,
  displayOrdersFromIds,
  duplicateMonthlyMonthMessage,
  findMonthlyCatalogueForMonth,
  findOverlappingWebsiteOverride,
  isArchivedCatalogueStatus,
  nextCatalogueDisplayOrder,
  parseCatalogueCopyFrom,
  parseCatalogueCreateInput,
  parseCatalogueDetailsInput,
  parseShowInPastMenuFlag,
  websiteOverrideConflictMessage,
  type CatalogueCreateInput,
  type WebsiteOverrideConflict,
} from "@/workspaces/library/collections/catalogue";

async function requireLibraryStaff() {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }
  return staff;
}

export async function createCatalogueAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const parsed = parseCatalogueCreateInput(formData);
  if (typeof parsed === "string") {
    return { error: parsed };
  }

  const copyFrom = parseCatalogueCopyFrom(formData);
  const copyError = catalogueCopySelectionError(parsed.purpose, copyFrom);
  if (copyError) {
    return { error: copyError };
  }

  let createInput: CatalogueCreateInput = parsed;
  if (copyFrom.kind === "id") {
    createInput = {
      ...parsed,
      status: "draft",
      websiteOverride: false,
    };
  }

  const supabase = await createClient();

  if (createInput.purpose === "monthly" && createInput.month) {
    try {
      const { data: monthlies, error: monthError } = await supabase
        .from("collections")
        .select("id, purpose, month")
        .eq("purpose", "monthly")
        .eq("month", createInput.month);
      if (monthError) {
        throw new Error(monthError.message);
      }
      if (findMonthlyCatalogueForMonth(createInput.month, monthlies ?? [])) {
        return { error: duplicateMonthlyMonthMessage(createInput.month) };
      }
    } catch (error) {
      return mutationError(error, "Could not check existing monthly catalogues.");
    }
  }

  let membershipRows: Array<{
    library_cake_id: string;
    available: boolean;
    sort_order: number;
  }> = [];
  if (copyFrom.kind === "id") {
    try {
      const { data: source, error: sourceError } = await supabase
        .from("collections")
        .select("id, purpose")
        .eq("id", copyFrom.id)
        .maybeSingle();
      if (sourceError) {
        throw new Error(sourceError.message);
      }
      if (!source || source.purpose !== "monthly") {
        return {
          error: "Choose a monthly catalogue to copy, or start empty.",
        };
      }
      const { data: sourceMembers, error: membersError } = await supabase
        .from("collection_cakes")
        .select("library_cake_id, available, sort_order")
        .eq("collection_id", copyFrom.id)
        .order("sort_order", { ascending: true });
      if (membersError) {
        throw new Error(membersError.message);
      }
      membershipRows = copyCatalogueMembershipRows(
        (sourceMembers ?? []).map((row) => ({
          libraryCakeId: String(row.library_cake_id),
          available: row.available === true,
          sortOrder: Number(row.sort_order),
        })),
      ).map((row) => ({
        library_cake_id: row.libraryCakeId,
        available: row.available,
        sort_order: row.sortOrder,
      }));
    } catch (error) {
      return mutationError(error, "Could not load the catalogue to copy.");
    }
  }

  if (createInput.websiteOverride && createInput.startDate && createInput.endDate) {
    try {
      const conflict = await findPublishedOverrideConflict(supabase, {
        startDate: createInput.startDate,
        endDate: createInput.endDate,
      });
      if (conflict) {
        return { error: websiteOverrideConflictMessage(conflict) };
      }
    } catch (error) {
      return mutationError(error, "Could not check website override dates.");
    }
  }

  const displayOrder = await nextDisplayOrderValue(supabase);
  const insertRow = {
    ...catalogueInsertRow(createInput),
    ...(displayOrder == null ? {} : { display_order: displayOrder }),
  };
  const { data, error } = await supabase
    .from("collections")
    .insert(insertRow)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23P01") {
      return {
        error:
          "Cannot publish as a website override: the date range overlaps another published special catalogue. Turn that override off first.",
      };
    }
    return { error: error.message };
  }

  if (membershipRows.length > 0) {
    const { error: copyErrorInsert } = await supabase
      .from("collection_cakes")
      .insert(
        membershipRows.map((row) => ({
          collection_id: data.id,
          library_cake_id: row.library_cake_id,
          available: row.available,
          sort_order: row.sort_order,
        })),
      );
    if (copyErrorInsert) {
      await supabase.from("collections").delete().eq("id", data.id);
      if (copyErrorInsert.code === "23505") {
        return {
          error: "Could not copy that catalogue because a cake would be duplicated.",
        };
      }
      return { error: copyErrorInsert.message };
    }
  }

  revalidatePath("/library/collections");
  const copiedQuery =
    copyFrom.kind === "id" ? `?${CATALOGUE_COPIED_QUERY}=1` : "";
  redirect(`/library/collections/${data.id}${copiedQuery}`);
}

async function findPublishedOverrideConflict(
  supabase: Awaited<ReturnType<typeof createClient>>,
  candidate: { startDate: string; endDate: string; excludeId?: string },
): Promise<WebsiteOverrideConflict | null> {
  const { data, error } = await supabase
    .from("collections")
    .select("id, name, start_date, end_date")
    .eq("purpose", "special")
    .eq("website_override", true);
  if (error) {
    throw new Error(error.message);
  }
  const published: WebsiteOverrideConflict[] = (data ?? [])
    .map((row) => ({
      id: String(row.id),
      name: String(row.name),
      startDate: String(row.start_date ?? "").slice(0, 10),
      endDate: String(row.end_date ?? "").slice(0, 10),
    }))
    .filter((row) => row.startDate && row.endDate);
  return findOverlappingWebsiteOverride(candidate, published);
}

export async function setCatalogueWebsiteOverrideAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const collectionId = String(formData.get("collection_id") ?? "").trim();
  const raw = String(formData.get("website_override") ?? "").toLowerCase();
  const websiteOverride = raw === "true" || raw === "on" || raw === "1";
  if (!collectionId) {
    return { error: "Catalogue is required." };
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("collections")
    .select("id, name, purpose, start_date, end_date, website_override")
    .eq("id", collectionId)
    .maybeSingle();
  if (existingError) {
    return { error: existingError.message };
  }
  if (!existing) {
    return { error: "That catalogue could not be found." };
  }
  if (existing.purpose !== "special") {
    return {
      error: "Website override is only for special-occasion catalogues.",
    };
  }

  if (!websiteOverride) {
    const { error } = await supabase
      .from("collections")
      .update({ website_override: false })
      .eq("id", collectionId)
      .eq("purpose", "special");
    if (error) {
      return { error: error.message };
    }
    revalidateCollectionPaths(collectionId);
    return { error: null };
  }

  const startDate = String(existing.start_date ?? "").slice(0, 10);
  const endDate = String(existing.end_date ?? "").slice(0, 10);
  if (!startDate || !endDate) {
    return { error: "Set a start date and end date first." };
  }

  try {
    const conflict = await findPublishedOverrideConflict(supabase, {
      startDate,
      endDate,
      excludeId: collectionId,
    });
    if (conflict) {
      return { error: websiteOverrideConflictMessage(conflict) };
    }
  } catch (error) {
    return mutationError(error, "Could not check website override dates.");
  }

  const { error } = await supabase
    .from("collections")
    .update({ website_override: true })
    .eq("id", collectionId)
    .eq("purpose", "special");
  if (error) {
    if (error.code === "23P01") {
      return {
        error:
          "Cannot publish as a website override: the date range overlaps another published special catalogue. Turn that override off first.",
      };
    }
    return { error: error.message };
  }

  revalidateCollectionPaths(collectionId);
  return { error: null };
}

export async function publishCatalogueAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const collectionId = String(formData.get("collection_id") ?? "").trim();
  if (!collectionId) {
    return { error: "Catalogue is required." };
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("collections")
    .select("id, status")
    .eq("id", collectionId)
    .maybeSingle();
  if (existingError) {
    return { error: existingError.message };
  }
  if (!existing) {
    return { error: "That catalogue could not be found." };
  }
  if (existing.status === "archived") {
    return { error: "Archived catalogues cannot be published." };
  }
  if (existing.status !== "active") {
    const { error } = await supabase
      .from("collections")
      .update({ status: "active" })
      .eq("id", collectionId)
      .eq("status", "draft");
    if (error) {
      return { error: error.message };
    }
  }

  revalidateCollectionPaths(collectionId);
  redirect(
    `/library/collections/${collectionId}?${CATALOGUE_PUBLISHED_QUERY}=1`,
  );
}

export async function unpublishCatalogueAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const collectionId = String(formData.get("collection_id") ?? "").trim();
  if (!collectionId) {
    return { error: "Catalogue is required." };
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("collections")
    .select("id, status")
    .eq("id", collectionId)
    .maybeSingle();
  if (existingError) {
    return { error: existingError.message };
  }
  if (!existing) {
    return { error: "That catalogue could not be found." };
  }
  if (existing.status === "archived") {
    return { error: "Archived catalogues cannot be unpublished." };
  }
  if (existing.status !== "draft") {
    const { error } = await supabase
      .from("collections")
      .update({ status: "draft" })
      .eq("id", collectionId)
      .eq("status", "active");
    if (error) {
      return { error: error.message };
    }
  }

  revalidateCollectionPaths(collectionId);
  redirect(
    `/library/collections/${collectionId}?${CATALOGUE_UNPUBLISHED_QUERY}=1`,
  );
}

function revalidateCollectionPaths(collectionId: string) {
  revalidatePath("/library/collections");
  revalidatePath(`/library/collections/${collectionId}`);
  revalidatePath("/");
  revalidatePath("/order");
  revalidatePath("/browse");
  revalidatePath("/cakes");
}

function isMissingDisplayOrderColumn(message: string): boolean {
  return message.includes("display_order");
}

async function nextDisplayOrderValue(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("collections")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingDisplayOrderColumn(error.message)) return null;
    throw new Error(error.message);
  }
  const current = Number(
    (data as { display_order?: number | null } | null)?.display_order,
  );
  return nextCatalogueDisplayOrder(Number.isFinite(current) ? [current] : []);
}

async function writeCatalogueDisplayOrder(
  ids: string[],
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const updates = displayOrdersFromIds(ids);
  for (const update of updates) {
    const { error } = await supabase
      .from("collections")
      .update({ display_order: update.displayOrder })
      .eq("id", update.id);
    if (error) {
      if (isMissingDisplayOrderColumn(error.message)) {
        return {
          error:
            "Catalogue display order is not available yet. Apply the display-order migration first.",
        };
      }
      throw new Error(error.message);
    }
  }
  return { error: null };
}

export async function reorderCataloguesAction(
  orderedIds: string[],
): Promise<{ error: string | null }> {
  await requireLibraryStaff();
  try {
    const ids = orderedIds.map((id) => String(id).trim()).filter(Boolean);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("collections")
      .select("id, status, purpose, month, end_date")
      .order("display_order", { ascending: true });
    if (error) {
      throw new Error(error.message);
    }
    const todayYmd = toBusinessDateKey();
    const current = (data ?? [])
      .filter(
        (row) =>
          !isEffectivelyArchived(
            {
              purpose: String(row.purpose ?? "monthly"),
              status: String(row.status),
              month: row.month ? String(row.month).slice(0, 10) : null,
              endDate: row.end_date ? String(row.end_date).slice(0, 10) : null,
            },
            todayYmd,
          ),
      )
      .map((row) => String(row.id));
    if (ids.length !== current.length) {
      return {
        error: "Catalogue list is out of date. Refresh and try again.",
      };
    }
    const currentSet = new Set(current);
    const seen = new Set<string>();
    for (const id of ids) {
      if (!currentSet.has(id) || seen.has(id)) {
        return {
          error: "Catalogue list is out of date. Refresh and try again.",
        };
      }
      seen.add(id);
    }
    const unchanged = ids.every((id, index) => id === current[index]);
    if (unchanged) {
      return { error: null };
    }
    const written = await writeCatalogueDisplayOrder(ids);
    if (written.error) return written;
    revalidatePath("/library/collections");
    revalidatePath("/order");
    return { error: null };
  } catch (error) {
    return mutationError(error, "Could not reorder catalogues.");
  }
}

function mutationError(error: unknown, fallback: string): { error: string } {
  return {
    error: error instanceof Error ? error.message : fallback,
  };
}

export async function updateCatalogueDetailsAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const collectionId = String(formData.get("collection_id") ?? "").trim();
  if (!collectionId) {
    return { error: "Catalogue is required." };
  }
  const parsed = parseCatalogueDetailsInput(formData);
  if (typeof parsed === "string") {
    return { error: parsed };
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("collections")
    .select("id")
    .eq("id", collectionId)
    .maybeSingle();
  if (existingError) {
    return { error: existingError.message };
  }
  if (!existing) {
    return { error: "That catalogue could not be found." };
  }

  const { error } = await supabase
    .from("collections")
    .update({ name: parsed.name })
    .eq("id", collectionId);
  if (error) {
    return { error: error.message };
  }

  revalidateCollectionPaths(collectionId);
  redirect(
    `/library/collections/${collectionId}?${CATALOGUE_UPDATED_QUERY}=1`,
  );
}

export async function setCatalogueShowInPastMenuAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const collectionId = String(formData.get("collection_id") ?? "").trim();
  if (!collectionId) {
    return { error: "Catalogue is required." };
  }
  const showInPastMenu = parseShowInPastMenuFlag(
    formData.get("show_in_past_menu"),
  );

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("collections")
    .select("id")
    .eq("id", collectionId)
    .maybeSingle();
  if (existingError) {
    return { error: existingError.message };
  }
  if (!existing) {
    return { error: "That catalogue could not be found." };
  }

  const { error } = await supabase
    .from("collections")
    .update({ show_in_past_menu: showInPastMenu })
    .eq("id", collectionId);
  if (error) {
    if (error.message.includes("show_in_past_menu")) {
      return {
        error:
          "Past Menu visibility is not available yet. Apply the show-in-past-menu migration first.",
      };
    }
    return { error: error.message };
  }

  revalidateCollectionPaths(collectionId);
  revalidatePath(`/browse/menu/${collectionId}`);
  redirect(
    `/library/collections/${collectionId}?${CATALOGUE_PAST_MENU_QUERY}=1`,
  );
}

export async function archiveCatalogueAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const collectionId = String(formData.get("collection_id") ?? "").trim();
  if (!collectionId) {
    return { error: "Catalogue is required." };
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("collections")
    .select("id, status")
    .eq("id", collectionId)
    .maybeSingle();
  if (existingError) {
    return { error: existingError.message };
  }
  if (!existing) {
    return { error: "That catalogue could not be found." };
  }
  const blocked = catalogueArchiveBlockedMessage(String(existing.status));
  if (blocked) {
    return { error: blocked };
  }

  const { error } = await supabase
    .from("collections")
    .update({ status: "archived" })
    .eq("id", collectionId)
    .eq("status", "draft");
  if (error) {
    return { error: error.message };
  }

  revalidateCollectionPaths(collectionId);
  redirect(
    `/library/collections/${collectionId}?${CATALOGUE_ARCHIVED_QUERY}=1`,
  );
}

export async function restoreCatalogueAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const collectionId = String(formData.get("collection_id") ?? "").trim();
  if (!collectionId) {
    return { error: "Catalogue is required." };
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("collections")
    .select("id, status, purpose, month, end_date")
    .eq("id", collectionId)
    .maybeSingle();
  if (existingError) {
    return { error: existingError.message };
  }
  if (!existing) {
    return { error: "That catalogue could not be found." };
  }
  const status = String(existing.status);
  const expired = isCatalogueExpired(
    {
      purpose: String(existing.purpose ?? "monthly"),
      status,
      month: existing.month ? String(existing.month).slice(0, 10) : null,
      endDate: existing.end_date ? String(existing.end_date).slice(0, 10) : null,
    },
    toBusinessDateKey(),
  );
  const archived = isArchivedCatalogueStatus(status);
  if (!archived && !(status === "active" && expired)) {
    return { error: "Only archived catalogues can be restored." };
  }

  const { error } = await supabase
    .from("collections")
    .update({ status: "draft" })
    .eq("id", collectionId)
    .eq("status", archived ? "archived" : "active");
  if (error) {
    return { error: error.message };
  }

  revalidateCollectionPaths(collectionId);
  redirect(
    `/library/collections/${collectionId}?${CATALOGUE_RESTORED_QUERY}=1`,
  );
}

async function requireMutableCatalogue(collectionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .select("id, status")
    .eq("id", collectionId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return { error: "That catalogue could not be found." };
  }
  if (isArchivedCatalogueStatus(String(data.status))) {
    return { error: "Restore this catalogue before changing its cakes." };
  }
  return { error: null };
}

async function membershipIdsInOrder(collectionId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collection_cakes")
    .select("id")
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => String(row.id));
}

async function writeSortOrder(collectionId: string, ids: string[]) {
  const supabase = await createClient();
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (!id) continue;
    const { error } = await supabase
      .from("collection_cakes")
      .update({ sort_order: index })
      .eq("id", id)
      .eq("collection_id", collectionId);
    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function addCakeToCollectionAction(
  collectionId: string,
  libraryCakeId: string,
): Promise<{ error: string | null }> {
  await requireLibraryStaff();
  const cakeId = libraryCakeId.trim();
  if (!cakeId) {
    return { error: "Choose a Library cake to add." };
  }

  try {
    const locked = await requireMutableCatalogue(collectionId);
    if (locked.error) return locked;
    const supabase = await createClient();
    const { data: existing, error: existingError } = await supabase
      .from("collection_cakes")
      .select("id")
      .eq("collection_id", collectionId)
      .eq("library_cake_id", cakeId)
      .maybeSingle();
    if (existingError) {
      throw new Error(existingError.message);
    }
    if (existing?.id) {
      return { error: "This cake is already in the collection." };
    }

    const { data: cake, error: cakeError } = await supabase
      .from("library_cakes")
      .select("id")
      .eq("id", cakeId)
      .maybeSingle();
    if (cakeError) {
      throw new Error(cakeError.message);
    }
    if (!cake) {
      return { error: "That Library cake could not be found." };
    }

    const ids = await membershipIdsInOrder(collectionId);
    const { error } = await supabase.from("collection_cakes").insert({
      collection_id: collectionId,
      library_cake_id: cakeId,
      available: true,
      sort_order: ids.length,
    });
    if (error) {
      if (error.code === "23505") {
        return { error: "This cake is already in the collection." };
      }
      throw new Error(error.message);
    }

    revalidateCollectionPaths(collectionId);
    return { error: null };
  } catch (error) {
    return mutationError(error, "Could not add that cake to the collection.");
  }
}

export async function toggleCollectionCakeAvailableAction(
  collectionId: string,
  membershipId: string,
  available: boolean,
): Promise<{ error: string | null }> {
  await requireLibraryStaff();
  try {
    const locked = await requireMutableCatalogue(collectionId);
    if (locked.error) return locked;
    const supabase = await createClient();
    const { error } = await supabase
      .from("collection_cakes")
      .update({ available })
      .eq("id", membershipId)
      .eq("collection_id", collectionId);
    if (error) {
      throw new Error(error.message);
    }
    revalidateCollectionPaths(collectionId);
    return { error: null };
  } catch (error) {
    return mutationError(error, "Could not update collection availability.");
  }
}

export async function removeCakeFromCollectionAction(
  collectionId: string,
  membershipId: string,
): Promise<{ error: string | null }> {
  await requireLibraryStaff();
  try {
    const locked = await requireMutableCatalogue(collectionId);
    if (locked.error) return locked;
    const supabase = await createClient();
    const { error } = await supabase
      .from("collection_cakes")
      .delete()
      .eq("id", membershipId)
      .eq("collection_id", collectionId);
    if (error) {
      throw new Error(error.message);
    }
    const remaining = await membershipIdsInOrder(collectionId);
    await writeSortOrder(collectionId, remaining);
    revalidateCollectionPaths(collectionId);
    return { error: null };
  } catch (error) {
    return mutationError(
      error,
      "Could not remove that cake from the collection.",
    );
  }
}

export async function moveCollectionCakeAction(
  collectionId: string,
  membershipId: string,
  direction: -1 | 1,
): Promise<{ error: string | null }> {
  await requireLibraryStaff();
  try {
    const locked = await requireMutableCatalogue(collectionId);
    if (locked.error) return locked;
    const ids = await membershipIdsInOrder(collectionId);
    const index = ids.indexOf(membershipId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) {
      return { error: null };
    }
    const swapped = [...ids];
    const current = swapped[index];
    const neighbour = swapped[nextIndex];
    if (!current || !neighbour) {
      return { error: null };
    }
    swapped[index] = neighbour;
    swapped[nextIndex] = current;
    await writeSortOrder(collectionId, swapped);
    revalidateCollectionPaths(collectionId);
    return { error: null };
  } catch (error) {
    return mutationError(error, "Could not reorder that cake.");
  }
}

export async function reorderCollectionCakesAction(
  collectionId: string,
  orderedMembershipIds: string[],
): Promise<{ error: string | null }> {
  await requireLibraryStaff();
  try {
    const locked = await requireMutableCatalogue(collectionId);
    if (locked.error) return locked;
    const ids = orderedMembershipIds
      .map((id) => String(id).trim())
      .filter(Boolean);
    const current = await membershipIdsInOrder(collectionId);
    if (ids.length !== current.length) {
      return {
        error: "Collection order is out of date. Refresh and try again.",
      };
    }
    const currentSet = new Set(current);
    const seen = new Set<string>();
    for (const id of ids) {
      if (!currentSet.has(id) || seen.has(id)) {
        return {
          error: "Collection order is out of date. Refresh and try again.",
        };
      }
      seen.add(id);
    }
    const unchanged = ids.every((id, index) => id === current[index]);
    if (unchanged) {
      return { error: null };
    }
    await writeSortOrder(collectionId, ids);
    revalidateCollectionPaths(collectionId);
    return { error: null };
  } catch (error) {
    return mutationError(error, "Could not reorder the collection.");
  }
}
