import { dineInVenueLabel } from "@/engines/business-calendar/dine-in-hours";
import { workspaceFulfilmentSectionTitle } from "@/engines/orders/fulfilment";
import { formatDdMmYyyy } from "@/lib/dates";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";

export type GuestPreorderCopyEmailInput = {
  customerName: string;
  orderNumber: string | null;
  items: Array<{
    cakeName: string;
    sizeLabel: string;
    quantity: number;
    unitPrice: number | null;
  }>;
  fulfilmentMethod: "pickup" | "dine_in" | "delivery";
  pickupDate: string;
  pickupTime: string;
  dineInVenue: "hyphen" | "whitebird" | null;
  reservationTime: string | null;
  guestCount: number | null;
  total: number;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildGuestPreorderCopyEmail(
  input: GuestPreorderCopyEmailInput,
): { subject: string; html: string } {
  const orderRef = input.orderNumber?.trim() || "your preorder";
  const lines = input.items.map((item) => {
    const price =
      item.unitPrice != null ? ` · ${formatRm(item.unitPrice * item.quantity)}` : "";
    return `${item.cakeName} · ${item.sizeLabel} × ${item.quantity}${price}`;
  });
  const venue =
    input.fulfilmentMethod === "dine_in" && input.dineInVenue
      ? dineInVenueLabel(input.dineInVenue)
      : null;
  const subject = `Whitebird preorder received${input.orderNumber ? ` · ${input.orderNumber}` : ""}`;
  const html = `
    <p>Dear ${escapeHtml(input.customerName)},</p>
    <p><strong>Order Received</strong><br />Payment Pending<br />Whitebird will contact you via WhatsApp.</p>
    <p>This is a copy of ${escapeHtml(orderRef)}.</p>
    ${
      lines.length
        ? `<p><strong>Your order</strong><br />${lines
            .map((line) => escapeHtml(line))
            .join("<br />")}</p>`
        : ""
    }
    <p>
      <strong>Fulfilment:</strong> ${escapeHtml(workspaceFulfilmentSectionTitle(input.fulfilmentMethod))}<br />
      <strong>Date:</strong> ${escapeHtml(formatDdMmYyyy(input.pickupDate))}<br />
      <strong>Time:</strong> ${escapeHtml(formatPickupTime(input.pickupTime))}
      ${
        venue
          ? `<br /><strong>Venue:</strong> ${escapeHtml(venue)}`
          : ""
      }
      ${
        input.reservationTime
          ? `<br /><strong>Reservation:</strong> ${escapeHtml(formatPickupTime(input.reservationTime))}`
          : ""
      }
      ${
        input.guestCount != null
          ? `<br /><strong>Guests:</strong> ${escapeHtml(String(input.guestCount))}`
          : ""
      }
    </p>
    <p><strong>Total:</strong> ${escapeHtml(formatRm(input.total))}</p>
  `;
  return { subject, html };
}
