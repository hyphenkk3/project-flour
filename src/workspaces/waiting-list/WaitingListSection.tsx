import {
  WAITING_LIST_ITEM_STATUSES,
  type WaitingListItemStatus,
} from "@/engines/waiting-list/types";
import type {
  WaitingListBoardRow,
  WaitingListCakeOption,
  WaitingListCollectionSetting,
} from "@/workspaces/waiting-list/types";
import { WaitingListBoard } from "@/workspaces/waiting-list/WaitingListBoard";
import {
  listWaitingListBoard,
  listWaitingListCakeOptions,
  listWaitingListCollections,
} from "@/workspaces/waiting-list/queries";

type WaitingListSectionProps = {
  dateParam?: string;
  cakeParam?: string;
  statusParam?: string;
  sizeParam?: string;
  canManage: boolean;
  canConfigure: boolean;
  month: string;
};

export async function WaitingListSection({
  dateParam,
  cakeParam,
  statusParam,
  sizeParam,
  canManage,
  canConfigure,
  month,
}: WaitingListSectionProps) {
  const date = dateParam?.trim().slice(0, 10) ?? "";
  const cakeId = cakeParam?.trim() ?? "";
  const status = statusParam?.trim() ?? "";
  const sizeId = sizeParam?.trim() ?? "";

  let rows: WaitingListBoardRow[] = [];
  let cakes: WaitingListCakeOption[] = [];
  let collections: WaitingListCollectionSetting[] = [];

  try {
    rows = await listWaitingListBoard({
      date: date || undefined,
      cakeId: cakeId || undefined,
      status: status || undefined,
      sizeId: sizeId || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/waiting_list|schema cache|does not exist/i.test(message)) {
      throw error;
    }
  }

  try {
    cakes = await listWaitingListCakeOptions();
  } catch {
    cakes = [];
  }

  try {
    collections = await listWaitingListCollections();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/waiting_list|schema cache|does not exist/i.test(message)) {
      throw error;
    }
  }

  const statusFilter = WAITING_LIST_ITEM_STATUSES.includes(
    status as WaitingListItemStatus,
  )
    ? status
    : "";

  return (
    <WaitingListBoard
      cakes={cakes}
      canConfigure={canConfigure}
      canManage={canManage}
      collections={collections}
      dateFilter={date}
      month={month}
      cakeFilter={cakeId}
      rows={rows}
      sizeFilter={sizeId}
      statusFilter={statusFilter}
    />
  );
}
