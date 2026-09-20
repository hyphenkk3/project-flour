import { createClient } from "@/lib/supabase/server";
import { parseBusinessDate, toBusinessDateKey } from "@/lib/dates";
import type { WaitingListItemStatus } from "@/engines/waiting-list/types";
import {
  parseWaitingListNotificationPayload,
  waitingListHomePreviewLine,
  waitingListNotificationHref,
} from "@/engines/waiting-list/staff-notification";
import { WAITING_LIST_FILTER_ACTION } from "@/workspaces/waiting-list/filter";
import type {
  HomeWaitingListAttention,
  WaitingListBoardRow,
  WaitingListCakeOption,
  WaitingListCollectionSetting,
} from "@/workspaces/waiting-list/types";

function isMissingWaitingList(message: string): boolean {
  return /waiting_list|schema cache|does not exist/i.test(message);
}

function asId(value: unknown): string {
  return String(value ?? "").trim();
}

export async function listWaitingListCollections(): Promise<
  WaitingListCollectionSetting[]
> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("collections")
      .select("id, name, waiting_list_enabled, waiting_list_response_minutes")
      .order("name", { ascending: true });
    if (error) {
      if (isMissingWaitingList(error.message)) return [];
      throw new Error(error.message);
    }
    return (data ?? []).map((row) => ({
      id: asId((row as { id?: string }).id),
      name: String((row as { name?: string }).name ?? "Collection"),
      waitingListEnabled: Boolean(
        (row as { waiting_list_enabled?: boolean }).waiting_list_enabled,
      ),
      waitingListResponseMinutes:
        (row as { waiting_list_response_minutes?: number | null })
          .waiting_list_response_minutes ?? null,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isMissingWaitingList(message)) return [];
    throw error;
  }
}

export async function listWaitingListCakeOptions(): Promise<
  WaitingListCakeOption[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_cakes")
    .select("id, name, library_cake_sizes ( id, label )")
    .in("status", ["active", "seasonal"])
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const sizesRel = (row as { library_cake_sizes?: unknown }).library_cake_sizes;
    const sizes = Array.isArray(sizesRel) ? sizesRel : [];
    return {
      id: asId((row as { id?: string }).id),
      name: String((row as { name?: string }).name ?? "Cake"),
      sizes: sizes.map((size) => ({
        id: asId((size as { id?: string }).id),
        label: String((size as { label?: string }).label ?? "Size"),
      })),
    };
  });
}

export async function listWaitingListBoard(input: {
  date?: string;
  cakeId?: string;
  status?: string;
  sizeId?: string;
}): Promise<WaitingListBoardRow[]> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("waiting_list_items")
      .select(
        "id, request_id, pickup_date, library_cake_id, library_cake_size_id, quantity, remaining_quantity, queue_position, status, contacted_at, response_deadline_at, converted_order_id, created_at",
      )
      .order("pickup_date", { ascending: true })
      .order("queue_position", { ascending: true });
    if (input.date && parseBusinessDate(input.date)) {
      query = query.eq("pickup_date", input.date);
    }
    if (input.cakeId) query = query.eq("library_cake_id", input.cakeId);
    if (input.sizeId) query = query.eq("library_cake_size_id", input.sizeId);
    if (input.status) query = query.eq("status", input.status);

    const { data: items, error } = await query;
    if (error) {
      if (isMissingWaitingList(error.message)) return [];
      throw new Error(error.message);
    }
    const rows = items ?? [];
    if (rows.length === 0) return [];

    const requestIds = [
      ...new Set(rows.map((row) => asId((row as { request_id?: string }).request_id))),
    ].filter(Boolean);
    const { data: requestItemRows } = requestIds.length
      ? await supabase
          .from("waiting_list_items")
          .select(
            "id, request_id, library_cake_id, library_cake_size_id, quantity, created_at",
          )
          .in("request_id", requestIds)
          .order("created_at", { ascending: true })
      : { data: [] as unknown[] };
    const siblingRows = requestItemRows ?? [];
    const cakeIds = [
      ...new Set(
        [...rows, ...siblingRows].map((row) =>
          asId((row as { library_cake_id?: string }).library_cake_id),
        ),
      ),
    ].filter(Boolean);
    const sizeIds = [
      ...new Set(
        [...rows, ...siblingRows].map((row) =>
          asId((row as { library_cake_size_id?: string | null }).library_cake_size_id),
        ),
      ),
    ].filter(Boolean);
    const itemIds = rows.map((row) => asId((row as { id?: string }).id));
    const orderIds = [
      ...new Set(
        rows.map((row) =>
          asId((row as { converted_order_id?: string | null }).converted_order_id),
        ),
      ),
    ].filter(Boolean);

    const [{ data: requests }, { data: cakes }, { data: sizes }, { data: holds }, { data: events }, { data: orders }] =
      await Promise.all([
        supabase
          .from("waiting_list_requests")
          .select("id, guest_name, guest_phone, open_to_alternatives, created_at, notes")
          .in("id", requestIds),
        supabase.from("library_cakes").select("id, name").in("id", cakeIds),
        sizeIds.length > 0
          ? supabase.from("library_cake_sizes").select("id, label").in("id", sizeIds)
          : Promise.resolve({ data: [] as unknown[] }),
        supabase
          .from("production_capacity_holds")
          .select("waiting_list_item_id, quantity, status")
          .in("waiting_list_item_id", itemIds)
          .eq("status", "active"),
        supabase
          .from("waiting_list_events")
          .select("item_id, event_type")
          .in("item_id", itemIds)
          .eq("event_type", "capacity_action_required"),
        orderIds.length > 0
          ? supabase
              .from("orders")
              .select("id, order_number")
              .in("id", orderIds)
          : Promise.resolve({ data: [] as unknown[] }),
      ]);

    const requestById = new Map(
      (requests ?? []).map((row) => [asId((row as { id?: string }).id), row]),
    );
    const cakeById = new Map(
      (cakes ?? []).map((row) => [
        asId((row as { id?: string }).id),
        String((row as { name?: string }).name ?? "Cake"),
      ]),
    );
    const sizeById = new Map(
      (sizes ?? []).map((row) => [
        asId((row as { id?: string }).id),
        String((row as { label?: string }).label ?? "Size"),
      ]),
    );
    const holdByItem = new Map<string, number>();
    for (const hold of holds ?? []) {
      const itemId = asId(
        (hold as { waiting_list_item_id?: string }).waiting_list_item_id,
      );
      holdByItem.set(
        itemId,
        Number((hold as { quantity?: number }).quantity ?? 0),
      );
    }
    const actionRequired = new Set(
      (events ?? []).map((row) => asId((row as { item_id?: string }).item_id)),
    );
    const orderNumberById = new Map(
      (orders ?? []).map((row) => [
        asId((row as { id?: string }).id),
        String((row as { order_number?: string }).order_number ?? ""),
      ]),
    );
    const requestItemsByRequest = new Map<
      string,
      Array<{
        itemId: string;
        cakeName: string;
        sizeLabel: string;
        quantity: number;
      }>
    >();
    for (const sibling of siblingRows) {
      const requestId = asId((sibling as { request_id?: string }).request_id);
      const cakeId = asId((sibling as { library_cake_id?: string }).library_cake_id);
      const sizeId = asId(
        (sibling as { library_cake_size_id?: string | null }).library_cake_size_id,
      );
      const list = requestItemsByRequest.get(requestId) ?? [];
      list.push({
        itemId: asId((sibling as { id?: string }).id),
        cakeName: cakeById.get(cakeId) ?? "Cake",
        sizeLabel: sizeById.get(sizeId) ?? "Size",
        quantity: Number((sibling as { quantity?: number }).quantity ?? 0),
      });
      requestItemsByRequest.set(requestId, list);
    }

    return rows.map((row) => {
      const itemId = asId((row as { id?: string }).id);
      const requestId = asId((row as { request_id?: string }).request_id);
      const request = requestById.get(requestId) as
        | {
            guest_name?: string;
            guest_phone?: string;
            open_to_alternatives?: boolean;
            created_at?: string;
            notes?: string | null;
          }
        | undefined;
      const cakeId = asId((row as { library_cake_id?: string }).library_cake_id);
      const sizeId = asId(
        (row as { library_cake_size_id?: string | null }).library_cake_size_id,
      );
      const convertedOrderId = asId(
        (row as { converted_order_id?: string | null }).converted_order_id,
      );
      return {
        itemId,
        requestId,
        guestName: String(request?.guest_name ?? "Guest"),
        guestPhone: String(request?.guest_phone ?? ""),
        cakeId,
        cakeName: cakeById.get(cakeId) ?? "Cake",
        sizeId: sizeId || null,
        sizeLabel: sizeById.get(sizeId) ?? "Size",
        quantity: Number((row as { quantity?: number }).quantity ?? 0),
        remainingQuantity: Number(
          (row as { remaining_quantity?: number }).remaining_quantity ?? 0,
        ),
        pickupDate: String((row as { pickup_date?: string }).pickup_date ?? "").slice(
          0,
          10,
        ),
        queuePosition: Number((row as { queue_position?: number }).queue_position ?? 0),
        joinedAt: String(
          request?.created_at ?? (row as { created_at?: string }).created_at ?? "",
        ),
        status: String((row as { status?: string }).status ?? "active") as WaitingListItemStatus,
        openToAlternatives: Boolean(request?.open_to_alternatives),
        notes: String(request?.notes ?? "").trim() || null,
        contactedAt:
          String((row as { contacted_at?: string | null }).contacted_at ?? "") ||
          null,
        responseDeadlineAt:
          String(
            (row as { response_deadline_at?: string | null }).response_deadline_at ??
              "",
          ) || null,
        convertedOrderId: convertedOrderId || null,
        convertedOrderNumber: convertedOrderId
          ? orderNumberById.get(convertedOrderId) ?? null
          : null,
        actionRequired: actionRequired.has(itemId),
        offeredQuantity: holdByItem.get(itemId) ?? null,
        requestItems: requestItemsByRequest.get(requestId) ?? [
          {
            itemId,
            cakeName: cakeById.get(cakeId) ?? "Cake",
            sizeLabel: sizeById.get(sizeId) ?? "Size",
            quantity: Number((row as { quantity?: number }).quantity ?? 0),
          },
        ],
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isMissingWaitingList(message)) return [];
    throw error;
  }
}

function isMissingNotification(message: string): boolean {
  return /staff_notification|schema cache|does not exist/i.test(message);
}

export async function listHomeWaitingListAttention(): Promise<HomeWaitingListAttention> {
  const empty: HomeWaitingListAttention = {
    count: 0,
    href: WAITING_LIST_FILTER_ACTION,
    preview: null,
  };
  try {
    const supabase = await createClient();
    const todayStart = `${toBusinessDateKey()}T00:00:00+08:00`;
    const { data, error } = await supabase
      .from("staff_notification_events")
      .select("id, href, payload, created_at")
      .eq("code", "waiting_list_new_request")
      .gte("created_at", todayStart)
      .order("created_at", { ascending: false });
    if (error) {
      if (
        isMissingNotification(error.message) ||
        isMissingWaitingList(error.message)
      ) {
        return empty;
      }
      throw new Error(error.message);
    }
    const parsed = (data ?? []).flatMap((row) => {
      const payload = parseWaitingListNotificationPayload(
        (row as { payload?: Record<string, unknown> | null }).payload ?? null,
      );
      if (!payload) return [];
      return [
        {
          payload,
          href:
            String((row as { href?: string | null }).href ?? "").trim() ||
            waitingListNotificationHref({
              pickupDate: payload.pickupDate,
              cakeId: payload.cakeId,
              sizeId: payload.sizeId,
            }),
        },
      ];
    });
    if (parsed.length === 0) return empty;

    const requestIds = [...new Set(parsed.map((row) => row.payload.requestId))];
    const { data: requests, error: requestError } = await supabase
      .from("waiting_list_requests")
      .select("id, status")
      .in("id", requestIds);
    if (requestError) {
      if (isMissingWaitingList(requestError.message)) return empty;
      throw new Error(requestError.message);
    }
    const activeIds = new Set(
      (requests ?? [])
        .filter((row) => {
          const status = String((row as { status?: string }).status ?? "");
          return status === "active" || status === "partially_converted";
        })
        .map((row) => asId((row as { id?: string }).id)),
    );
    const visible = parsed.filter((row) => activeIds.has(row.payload.requestId));
    const first = visible[0];
    if (!first) return empty;

    return {
      count: visible.length,
      href: first.href,
      preview: {
        requestId: first.payload.requestId,
        guestName: first.payload.guestName,
        line: waitingListHomePreviewLine({
          ...first.payload,
          extraItemCount: Math.max(0, first.payload.itemCount - 1),
        }),
        href: first.href,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isMissingNotification(message) || isMissingWaitingList(message)) {
      return empty;
    }
    throw error;
  }
}
