"use server";

import { requireStaff } from "@/foundation/auth/session";
import { canManageWaitingList } from "@/engines/waiting-list/capabilities";
import {
  generateWaitingListConfirmationToken,
  hashWaitingListConfirmationToken,
  isWaitingListConfirmationTokenHash,
  type WaitingListConfirmationItemSnapshot,
} from "@/engines/waiting-list/confirmation-link";
import { createClient } from "@/lib/supabase/server";

export type IssueWaitingListConfirmationLinkResult = {
  id: string;
  requestId: string;
  token: string;
  expiresAt: string;
  itemSnapshot: WaitingListConfirmationItemSnapshot[];
  error?: undefined;
};

export type IssueWaitingListConfirmationLinkError = {
  error: string;
};

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseItemSnapshot(value: unknown): WaitingListConfirmationItemSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const entry = row as Record<string, unknown>;
    const waitingListItemId = asTrimmed(
      entry.waiting_list_item_id ?? entry.waitingListItemId,
    );
    const cakeId = asTrimmed(entry.cake_id ?? entry.cakeId);
    const cakeSizeId = asTrimmed(entry.cake_size_id ?? entry.cakeSizeId);
    const offeredQuantity = Number(
      entry.offered_quantity ?? entry.offeredQuantity ?? 0,
    );
    if (
      !waitingListItemId ||
      !cakeId ||
      !cakeSizeId ||
      !Number.isFinite(offeredQuantity) ||
      offeredQuantity < 1
    ) {
      return [];
    }
    return [
      {
        waitingListItemId,
        cakeId,
        cakeSizeId,
        offeredQuantity: Math.floor(offeredQuantity),
      },
    ];
  });
}

/**
 * Staff-only issuance. Returns the raw token once so a later phase can
 * construct a WhatsApp URL. The database stores only the SHA-256 hash.
 * Does not create an order.
 */
export async function issueWaitingListConfirmationLink(
  requestId: string,
): Promise<
  IssueWaitingListConfirmationLinkResult | IssueWaitingListConfirmationLinkError
> {
  const staff = await requireStaff();
  if (!canManageWaitingList(staff.role.code)) {
    return { error: "Not authorized to manage the waiting list." };
  }
  const id = requestId.trim();
  if (!id) {
    return { error: "Waiting-list request is required." };
  }

  const token = generateWaitingListConfirmationToken();
  const tokenHash = hashWaitingListConfirmationToken(token);
  if (!isWaitingListConfirmationTokenHash(tokenHash)) {
    return { error: "Confirmation token hash is invalid." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "issue_waiting_list_confirmation_link",
    {
      p_actor_staff_id: staff.id,
      p_request_id: id,
      p_token_hash: tokenHash,
    },
  );
  if (error) {
    return { error: error.message };
  }
  const payload = data as Record<string, unknown> | null;
  const linkId = asTrimmed(payload?.id);
  const expiresAt = asTrimmed(payload?.expires_at);
  const itemSnapshot = parseItemSnapshot(payload?.item_snapshot);
  if (!linkId || !expiresAt || itemSnapshot.length === 0) {
    return { error: "Confirmation link was created but could not be confirmed." };
  }
  return {
    id: linkId,
    requestId: asTrimmed(payload?.request_id) || id,
    token,
    expiresAt,
    itemSnapshot,
  };
}

export async function invalidateWaitingListConfirmationLinks(
  requestId: string,
): Promise<{ count: number } | IssueWaitingListConfirmationLinkError> {
  const staff = await requireStaff();
  if (!canManageWaitingList(staff.role.code)) {
    return { error: "Not authorized to manage the waiting list." };
  }
  const id = requestId.trim();
  if (!id) {
    return { error: "Waiting-list request is required." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "invalidate_waiting_list_confirmation_links",
    {
      p_actor_staff_id: staff.id,
      p_request_id: id,
    },
  );
  if (error) {
    return { error: error.message };
  }
  const count = Number(data ?? 0);
  return { count: Number.isFinite(count) ? count : 0 };
}
