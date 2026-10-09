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

function fulfilmentIndependentDateLabel(
  pickupDate?: string | null,
): string | null {
  if (!pickupDate) return null;
  return formatShortBusinessDate(pickupDate);
}

function staffEmailHref(href?: string | null): string | null {
  if (
    !href?.startsWith("/") ||
    href.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(href) ||
    /%(?![0-9a-fA-F]{2})/.test(href)
  ) {
    return null;
  }

  const expectedOrigin =
    process.env.VERCEL_ENV === "production"
      ? "https://whitebird.asia"
      : process.env.VERCEL_ENV === "preview" &&
          process.env.VERCEL_GIT_COMMIT_REF ===
            "debug/mobile-add-to-order-safari"
        ? "https://dev.whitebird.asia"
        : null;
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!expectedOrigin || configuredOrigin !== expectedOrigin) return null;

  try {
    const origin = new URL(configuredOrigin);
    if (
      origin.protocol !== "https:" ||
      origin.origin !== expectedOrigin ||
      origin.username ||
      origin.password ||
      origin.port ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    ) {
      return null;
    }

    const destination = new URL(href, origin);
    return destination.origin === expectedOrigin ? destination.href : null;
  } catch {
    return null;
  }
}

function fulfilmentFromPreviewLine(description?: string | null): string | null {
  const line = (description ?? "").split("\n")[0]?.trim() ?? "";
  const parts = line.split(" · ");
  const last = parts[parts.length - 1]?.trim() ?? "";
  if (last === "Pickup" || last === "Dine-in" || last === "Delivery") {
    return last;
  }
  return null;
}

function buildNewOrderEmailHtml(
  summary: NewOrderNotificationSummary,
  href?: string | null,
  description?: string | null,
): string {
  const preview = description?.trim()
    ? `<p style="white-space: pre-line">${escapeHtml(description)}</p>`
    : "";
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
  const viewHref = staffEmailHref(href);

  return `
          <div
            style="
              font-family: Arial, sans-serif;
              line-height: 1.6;
            "
          >
            <h2>New order received</h2>
            ${preview}
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

export function buildStaffNotificationEmail(
  input: StaffNotificationEmailContent,
): {
  subject: string;
  html: string;
} {
  if (input.code === "new_order" && input.newOrder) {
    const orderNumber = input.newOrder.orderNumber ?? input.orderNumber ?? null;
    return {
      subject: orderNumber
        ? `New order received — ${orderNumber}`
        : "New order received",
      html: buildNewOrderEmailHtml(
        input.newOrder,
        input.href,
        input.description,
      ),
    };
  }

  const dateLabel = fulfilmentIndependentDateLabel(input.pickupDate);
  const subjectSuffix = input.orderNumber
    ? ` — ${input.orderNumber}`
    : input.customerName
      ? ` — ${input.customerName}`
      : "";
  const newOrderFulfilment =
    input.code === "new_order"
      ? fulfilmentFromPreviewLine(input.description)
      : null;
  const viewHref = staffEmailHref(input.href);

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
    newOrderFulfilment
      ? `<p><strong>Fulfilment:</strong> ${escapeHtml(newOrderFulfilment)}</p>`
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
              viewHref
                ? `<p><a href="${escapeHtml(viewHref)}">View in Whitebird</a></p>`
                : ""
            }
          </div>
        `,
  };
}
