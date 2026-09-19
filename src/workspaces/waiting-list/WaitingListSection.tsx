import {
  WAITING_LIST_ITEM_STATUSES,
  type WaitingListItemStatus,
} from "@/engines/waiting-list/types";
import { listCustomers } from "@/workspaces/customer-operations/customers/queries";
import type {
  WaitingListBoardRow,
  WaitingListCakeOption,
  WaitingListCollectionSetting,
  WaitingListCrmCustomerOption,
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
  let customers: WaitingListCrmCustomerOption[] = [];

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

  if (canManage) {
    customers = (await listCustomers()).map((customer) => ({
      id: customer.id,
      fullName: customer.fullName,
      phoneNumber: customer.phoneNumber,
    }));
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
      customers={customers}
      dateFilter={date}
      month={month}
      cakeFilter={cakeId}
      rows={rows}
      sizeFilter={sizeId}
      statusFilter={statusFilter}
    />
  );
}
