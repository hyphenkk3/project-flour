import { formatShortBusinessDate } from "@/lib/dates";
import type { StaffNotificationCode } from "@/foundation/staff/notification-preferences";

export type StaffNotificationEmailContent = {
  code: StaffNotificationCode;
  title: string;
  description: string;
  href?: string | null;
  orderNumber?: string | null;
  customerName?: string | null;
  cakeName?: string | null;
  pickupDate?: string | null;
  approvalRequestType?: string | null;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fulfilmentIndependentDateLabel(pickupDate?: string | null): string | null {
  if (!pickupDate) return null;
  return formatShortBusinessDate(pickupDate);
}

export function buildStaffNotificationEmail(input: StaffNotificationEmailContent): {
  subject: string;
  html: string;
} {
  const dateLabel = fulfilmentIndependentDateLabel(input.pickupDate);
  const subjectSuffix = input.orderNumber
    ? ` — ${input.orderNumber}`
    : input.customerName
      ? ` — ${input.customerName}`
      : "";

  const details = [
    input.orderNumber
      ? `<p><strong>Order:</strong> ${escapeHtml(input.orderNumber)}</p>`
      : "",
    input.customerName
      ? `<p><strong>Customer:</strong> ${escapeHtml(input.customerName)}</p>`
      : "",
    input.cakeName
      ? `<p><strong>Cake:</strong> ${escapeHtml(input.cakeName)}</p>`
      : "",
    dateLabel
      ? `<p><strong>Collection:</strong> ${escapeHtml(dateLabel)}</p>`
      : "",
    input.approvalRequestType
      ? `<p><strong>Approval:</strong> ${escapeHtml(input.approvalRequestType)}</p>`
      : "",
  ].join("");

  return {
    subject: `${input.title}${subjectSuffix}`,
    html: `
          <div
            style="
              font-family: Arial, sans-serif;
              line-height: 1.6;
            "
          >
            <h2>${escapeHtml(input.title)}</h2>
            <p>${escapeHtml(input.description)}</p>
            ${details}
            ${
              input.href
                ? `<p><a href="${escapeHtml(input.href)}">View in Whitebird</a></p>`
                : ""
            }
          </div>
        `,
  };
}
