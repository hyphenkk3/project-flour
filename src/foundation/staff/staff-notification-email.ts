import { formatShortBusinessDate } from "@/lib/dates";
import type { StaffNotificationCode } from "@/foundation/staff/notification-preferences";
import {
  formatNewOrderRm,
  newOrderEmailOrderLines,
  newOrderEmailSections,
  type NewOrderNotificationSummary,
} from "@/foundation/staff/staff-notification-new-order";

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
  newOrder?: NewOrderNotificationSummary | null;
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

function absoluteHref(href?: string | null): string | null {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (!base) return href;
  return `${base}${href.startsWith("/") ? href : `/${href}`}`;
}

function buildNewOrderEmailHtml(
  summary: NewOrderNotificationSummary,
  href?: string | null,
): string {
  const sections = newOrderEmailSections(summary)
    .map(
      (section) =>
        `<p><strong>${escapeHtml(section.label)}:</strong> ${escapeHtml(section.value)}</p>`,
    )
    .join("");
  const lines = newOrderEmailOrderLines(summary);
  const orderBlock = lines.length
    ? `<p><strong>Order:</strong></p><p>${lines
        .map((line) => escapeHtml(line))
        .join("<br />")}</p>`
    : "";
  const total = `<p><strong>Total:</strong> ${escapeHtml(formatNewOrderRm(summary.total))}</p>`;
  const notes = summary.notes
    ? `<p><strong>Notes:</strong><br />${escapeHtml(summary.notes)}</p>`
    : "";
  const viewHref = absoluteHref(href);

  return `
          <div
            style="
              font-family: Arial, sans-serif;
              line-height: 1.6;
            "
          >
            <h2>New order received</h2>
            ${sections}
            ${orderBlock}
            ${total}
            ${notes}
            ${
              viewHref
                ? `<p><a href="${escapeHtml(viewHref)}">View in Whitebird →</a></p>`
                : ""
            }
          </div>
        `;
}

export function buildStaffNotificationEmail(input: StaffNotificationEmailContent): {
  subject: string;
  html: string;
} {
  if (input.code === "new_order" && input.newOrder) {
    const orderNumber =
      input.newOrder.orderNumber ?? input.orderNumber ?? null;
    return {
      subject: orderNumber
        ? `New order received — ${orderNumber}`
        : "New order received",
      html: buildNewOrderEmailHtml(input.newOrder, input.href),
    };
  }

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
