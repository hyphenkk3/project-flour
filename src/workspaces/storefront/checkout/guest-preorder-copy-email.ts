import { after } from "next/server";
import { Resend } from "resend";

import { createServiceClient } from "@/lib/supabase/admin";
import { buildGuestPreorderCopyEmail } from "@/workspaces/storefront/checkout/guest-preorder-copy-email-content";
import { loadGuestPreorderReceipt } from "@/workspaces/storefront/checkout/receipt";

async function sendGuestPreorderCopyEmail(input: {
  orderId: string;
  email: string;
}): Promise<void> {
  const supabase = createServiceClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, guest_name, guest_email, email_submission_receipt_requested, customer_id",
    )
    .eq("id", input.orderId)
    .maybeSingle();

  if (error || !order) {
    throw new Error(error?.message ?? "Order not found for preorder copy email.");
  }
  if (!order.email_submission_receipt_requested) return;
  if (order.customer_id) return;

  const to = String(order.guest_email ?? "").trim() || input.email.trim();
  if (!to) return;

  const receipt = await loadGuestPreorderReceipt(input.orderId);
  const content = buildGuestPreorderCopyEmail({
    customerName: String(order.guest_name ?? "").trim() || "Customer",
    orderNumber: order.order_number ? String(order.order_number) : null,
    items: receipt?.items ?? [],
    fulfilmentMethod: receipt?.fulfilmentMethod ?? "pickup",
    pickupDate: receipt?.pickupDate ?? "",
    pickupTime: receipt?.pickupTime ?? "",
    dineInVenue: receipt?.dineInVenue ?? null,
    reservationTime: receipt?.reservationTime ?? null,
    guestCount: receipt?.guestCount ?? null,
    total: receipt?.total ?? 0,
  });

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const resend = new Resend(apiKey);
  const { error: sendError } = await resend.emails.send(
    {
      from: "Whitebird <onboarding@resend.dev>",
      to: [to],
      subject: content.subject,
      html: content.html,
    },
    { idempotencyKey: `guest-preorder-copy:${input.orderId}` },
  );
  if (sendError) {
    throw new Error(sendError.message);
  }
}

/**
 * Fire-and-forget customer preorder copy. Failures are logged and never
 * thrown to checkout. Independent of staff notification dispatch.
 */
export function scheduleGuestPreorderCopyEmail(input: {
  orderId: string;
  email: string;
  requested: boolean;
}): void {
  if (!input.requested || !input.email.trim()) return;

  const run = () =>
    void sendGuestPreorderCopyEmail({
      orderId: input.orderId,
      email: input.email,
    }).catch((error: unknown) => {
      console.error("[guest-preorder-copy] Email delivery failed:", error);
    });

  try {
    after(run);
  } catch {
    run();
  }
}
