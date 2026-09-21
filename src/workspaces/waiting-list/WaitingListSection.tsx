import {
  WAITING_LIST_ITEM_STATUSES,
  type WaitingListItemStatus,
} from "@/engines/waiting-list/types";
import { listCustomers } from "@/workspaces/customer-operations/customers/queries";
import { firstQueryDateParam, firstQueryParam } from "@/lib/query-params";
import { isTransientDataLoadError } from "@/lib/supabase/fetch-timeout";
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

function isWaitingListLoadFailure(message: string): boolean {
  return (
    /waiting_list|schema cache|does not exist/i.test(message) ||
    isTransientDataLoadError(message)
  );
}

export async function WaitingListSection({
  dateParam,
  cakeParam,
  statusParam,
  sizeParam,
  canManage,
  canConfigure,
  month,
}: WaitingListSectionProps) {
  const date = firstQueryDateParam(dateParam);
  const cakeId = firstQueryParam(cakeParam);
  const status = firstQueryParam(statusParam);
  const sizeId = firstQueryParam(sizeParam);

  let rows: WaitingListBoardRow[] = [];
  let cakes: WaitingListCakeOption[] = [];
  let collections: WaitingListCollectionSetting[] = [];
  let customers: WaitingListCrmCustomerOption[] = [];

  const [boardResult, cakesResult, collectionsResult, customersResult] =
    await Promise.allSettled([
      listWaitingListBoard({
        date: date || undefined,
        cakeId: cakeId || undefined,
        status: status || undefined,
        sizeId: sizeId || undefined,
      }),
      listWaitingListCakeOptions(),
      listWaitingListCollections(),
      canManage ? listCustomers() : Promise.resolve([]),
    ]);

  if (boardResult.status === "fulfilled") {
    rows = boardResult.value;
  } else {
    const message =
      boardResult.reason instanceof Error ? boardResult.reason.message : "";
    if (!isWaitingListLoadFailure(message)) throw boardResult.reason;
  }

  if (cakesResult.status === "fulfilled") {
    cakes = cakesResult.value;
  } else {
    cakes = [];
  }

  if (collectionsResult.status === "fulfilled") {
    collections = collectionsResult.value;
  } else {
    const message =
      collectionsResult.reason instanceof Error
        ? collectionsResult.reason.message
        : "";
    if (!isWaitingListLoadFailure(message)) throw collectionsResult.reason;
  }

  if (customersResult.status === "fulfilled") {
    customers = customersResult.value.map((customer) => ({
      id: customer.id,
      fullName: customer.fullName,
      phoneNumber: customer.phoneNumber,
    }));
  } else if (canManage) {
    const message =
      customersResult.reason instanceof Error
        ? customersResult.reason.message
        : "";
    if (!isTransientDataLoadError(message)) throw customersResult.reason;
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
