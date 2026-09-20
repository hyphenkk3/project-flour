"use client";

import { useRef, useState, useTransition } from "react";
import { FormError } from "@/components/ui/form";
import {
  WAITING_LIST_CONFIRMATION_CONVERT_LABEL,
  WAITING_LIST_CONFIRMATION_CONVERTED_LABEL,
  WAITING_LIST_CONFIRMATION_EXPIRED_LABEL,
  WAITING_LIST_CONFIRMATION_GENERATE_LABEL,
  WAITING_LIST_CONFIRMATION_INVALIDATED_LABEL,
  WAITING_LIST_CONFIRMATION_ISSUED_LABEL,
  WAITING_LIST_CONFIRMATION_SUBMITTED_LABEL,
  canConvertWaitingListConfirmation,
  eligibleWaitingListConfirmationItems,
  formatWaitingListConfirmationReviewCopy,
  waitingListConfirmationDeadlineLabel,
  waitingListConfirmationExcludedItems,
  waitingListConvertedOrderHref,
  type WaitingListConfirmationStaffLink,
} from "@/engines/waiting-list/confirmation-review";
import {
  buildWaitingListConfirmationWhatsAppMessage,
  waitingListConfirmationCustomerUrl,
  waitingListConfirmationItemLine,
  waitingListConfirmationWhatsAppUrl,
} from "@/engines/waiting-list/confirmation-whatsapp";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  convertWaitingListConfirmationAction,
  issueWaitingListConfirmationLinkAction,
} from "@/workspaces/waiting-list/actions";
import type { WaitingListBoardRow } from "@/workspaces/waiting-list/types";

const ghostButtonClass =
  "border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium transition disabled:opacity-60";
const inkButtonClass =
  "bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium transition disabled:opacity-60";

function siteOrigin(): string {
  return window.location.origin.replace(/\/$/, "");
}

type WaitingListConfirmationStaffPanelProps = {
  row: WaitingListBoardRow;
};

export function WaitingListConfirmationStaffPanel({
  row,
}: WaitingListConfirmationStaffPanelProps) {
  const link = row.confirmationLink;
  const eligible = eligibleWaitingListConfirmationItems(row.requestItems);
  const excluded = waitingListConfirmationExcludedItems(row.requestItems);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "message" | "details" | null>(
    null,
  );
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [issuedOverlay, setIssuedOverlay] =
    useState<WaitingListConfirmationStaffLink | null>(null);
  const [reviewOpen, setReviewOpen] = useState(
    link?.status === "submitted" || link?.status === "converted",
  );
  const [issuing, startIssue] = useTransition();
  const [converting, startConvert] = useTransition();
  const issuingLock = useRef(false);
  const convertingLock = useRef(false);

  const effectiveLink = issuedOverlay ?? link ?? null;
  const previewItems =
    effectiveLink && effectiveLink.items.length > 0
      ? effectiveLink.items
      : eligible;
  const canGenerate =
    (!effectiveLink ||
      effectiveLink.status === "expired" ||
      effectiveLink.status === "invalidated") &&
    eligible.length > 0;
  const canConvert = canConvertWaitingListConfirmation(effectiveLink);
  const convertedOrderHref = effectiveLink?.convertedOrderId
    ? waitingListConvertedOrderHref(effectiveLink.convertedOrderId)
    : "";

  const confirmationUrl = rawToken
    ? waitingListConfirmationCustomerUrl(rawToken, siteOrigin())
    : "";
  const whatsappMessage =
    confirmationUrl && previewItems.length > 0
      ? buildWaitingListConfirmationWhatsAppMessage({
          customerName: row.guestName,
          pickupDate: row.pickupDate,
          items: previewItems,
          confirmationUrl,
          deadlineAt: effectiveLink?.expiresAt ?? row.responseDeadlineAt ?? "",
        })
      : "";
  const whatsappUrl = whatsappMessage
    ? waitingListConfirmationWhatsAppUrl(row.guestPhone, whatsappMessage)
    : null;

  function markCopied(kind: "link" | "message" | "details") {
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  }

  function handleGenerate() {
    if (issuingLock.current || issuing || !canGenerate) return;
    issuingLock.current = true;
    setError(null);
    startIssue(async () => {
      try {
        const result = await issueWaitingListConfirmationLinkAction(
          row.requestId,
        );
        if (result.error || !result.token || !result.expiresAt) {
          setError(result.error ?? "Could not generate the confirmation link.");
          return;
        }
        setRawToken(result.token);
        setIssuedOverlay({
          id: result.id ?? row.requestId,
          requestId: result.requestId ?? row.requestId,
          status: "issued",
          expiresAt: result.expiresAt,
          issuedAt: new Date().toISOString(),
          submittedAt: null,
          convertedOrderId: null,
          convertedOrderNumber: null,
          items: result.items ?? previewItems,
          review: null,
        });
      } finally {
        issuingLock.current = false;
      }
    });
  }

  function handleCopyLink() {
    if (!confirmationUrl) return;
    void navigator.clipboard
      .writeText(confirmationUrl)
      .then(() => markCopied("link"));
  }

  function handleCopyMessage() {
    if (!whatsappMessage) return;
    void navigator.clipboard
      .writeText(whatsappMessage)
      .then(() => markCopied("message"));
  }

  function handleOpenWhatsApp() {
    if (!whatsappUrl) {
      setError("Could not build a WhatsApp link from this phone number.");
      return;
    }
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }

  function handleCopyDetails() {
    if (!effectiveLink?.review) return;
    void navigator.clipboard
      .writeText(formatWaitingListConfirmationReviewCopy(effectiveLink.review))
      .then(() => markCopied("details"));
  }

  function handleConvert() {
    if (convertingLock.current || converting || !canConvert) return;
    convertingLock.current = true;
    setError(null);
    startConvert(async () => {
      try {
        const result = await convertWaitingListConfirmationAction(
          row.requestId,
        );
        if (result.error || !result.orderId) {
          setError(
            result.error ?? "Could not convert this confirmation to an order.",
          );
          return;
        }
        setIssuedOverlay({
          ...(effectiveLink as WaitingListConfirmationStaffLink),
          status: "converted",
          convertedOrderId: result.orderId,
          convertedOrderNumber: result.orderNumber ?? result.orderId,
        });
        setReviewOpen(true);
      } finally {
        convertingLock.current = false;
      }
    });
  }

  if (!effectiveLink && eligible.length === 0) {
    return null;
  }

  return (
    <div className="border-fog space-y-3 rounded-lg border bg-white px-3 py-3">
      <p className="text-ink text-sm font-medium">Customer confirmation</p>

      {previewItems.length > 0 ? (
        <div>
          <p className="text-skyline text-xs">This confirmation includes:</p>
          <ul className="text-ink mt-1 space-y-0.5 text-sm">
            {previewItems.map((item) => (
              <li key={`${item.cakeName}-${item.sizeLabel}`}>
                {waitingListConfirmationItemLine(item)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canGenerate && excluded.length > 0 ? (
        <p className="text-skyline text-xs">
          Not included yet:{" "}
          {excluded
            .map(
              (item) =>
                `${item.cakeName} · ${item.sizeLabel} × ${item.quantity}`,
            )
            .join(" · ")}
        </p>
      ) : null}

      {effectiveLink?.status === "issued" ? (
        <p className="text-ink text-sm">
          {WAITING_LIST_CONFIRMATION_ISSUED_LABEL}
        </p>
      ) : null}
      {effectiveLink?.status === "submitted" ? (
        <p className="text-ink text-sm">
          {WAITING_LIST_CONFIRMATION_SUBMITTED_LABEL}
        </p>
      ) : null}
      {effectiveLink?.status === "converted" ? (
        <p className="text-ink text-sm">
          {WAITING_LIST_CONFIRMATION_CONVERTED_LABEL}
          {effectiveLink.convertedOrderNumber
            ? ` · ${effectiveLink.convertedOrderNumber}`
            : ""}
        </p>
      ) : null}
      {effectiveLink?.status === "expired" ? (
        <p className="text-ink text-sm">
          {WAITING_LIST_CONFIRMATION_EXPIRED_LABEL}
        </p>
      ) : null}
      {effectiveLink?.status === "invalidated" ? (
        <p className="text-ink text-sm">
          {WAITING_LIST_CONFIRMATION_INVALIDATED_LABEL}
        </p>
      ) : null}

      {effectiveLink?.expiresAt ? (
        <p className="text-skyline text-xs">
          {waitingListConfirmationDeadlineLabel(effectiveLink.expiresAt)}
        </p>
      ) : null}

      {effectiveLink?.status === "issued" && !rawToken ? (
        <p className="text-skyline text-xs">
          The customer link is only shown immediately after it is generated.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canGenerate ? (
          <button
            className={inkButtonClass}
            disabled={issuing}
            onClick={handleGenerate}
            type="button"
          >
            {issuing ? "Generating…" : WAITING_LIST_CONFIRMATION_GENERATE_LABEL}
          </button>
        ) : null}

        {effectiveLink?.status === "issued" && rawToken ? (
          <>
            <button
              className={ghostButtonClass}
              onClick={handleCopyLink}
              type="button"
            >
              {copied === "link" ? "Copied" : "Copy confirmation link"}
            </button>
            <button
              className={ghostButtonClass}
              onClick={handleCopyMessage}
              type="button"
            >
              {copied === "message" ? "Copied" : "Copy message"}
            </button>
            <button
              className={ghostButtonClass}
              onClick={handleOpenWhatsApp}
              type="button"
            >
              Open WhatsApp
            </button>
          </>
        ) : null}

        {(effectiveLink?.status === "submitted" ||
          effectiveLink?.status === "converted") &&
        effectiveLink.review ? (
          <>
            <button
              className={ghostButtonClass}
              onClick={() => setReviewOpen((open) => !open)}
              type="button"
            >
              {reviewOpen ? "Hide details" : "Review customer details"}
            </button>
            <button
              className={ghostButtonClass}
              onClick={handleCopyDetails}
              type="button"
            >
              {copied === "details" ? "Copied" : "Copy details"}
            </button>
          </>
        ) : null}

        {canConvert ? (
          <button
            className={inkButtonClass}
            disabled={converting}
            onClick={handleConvert}
            type="button"
          >
            {converting
              ? "Converting…"
              : WAITING_LIST_CONFIRMATION_CONVERT_LABEL}
          </button>
        ) : null}

        {effectiveLink?.status === "converted" && convertedOrderHref ? (
          <a className={ghostButtonClass} href={convertedOrderHref}>
            Open order
            {effectiveLink.convertedOrderNumber
              ? ` ${effectiveLink.convertedOrderNumber}`
              : ""}
          </a>
        ) : null}
      </div>

      {error ? <FormError message={error} /> : null}

      {reviewOpen && effectiveLink?.review ? (
        <WaitingListConfirmationReviewPanel review={effectiveLink.review} />
      ) : null}
    </div>
  );
}

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  if (value == null || value === "") return null;
  return (
    <p className="text-sm">
      <span className="text-skyline">{label}: </span>
      <span className="text-ink">{value}</span>
    </p>
  );
}

function WaitingListConfirmationReviewPanel({
  review,
}: {
  review: NonNullable<WaitingListConfirmationStaffLink["review"]>;
}) {
  return (
    <div className="border-fog divide-fog space-y-3 divide-y border-t pt-3">
      <section className="space-y-1 pb-3">
        <p className="text-ink text-xs font-semibold tracking-wide uppercase">
          Customer
        </p>
        <ReviewRow label="Name" value={review.customerName} />
        <ReviewRow label="WhatsApp" value={review.customerPhone} />
      </section>

      <section className="space-y-1 py-3">
        <p className="text-ink text-xs font-semibold tracking-wide uppercase">
          Fulfilment
        </p>
        <ReviewRow label="Method" value={review.fulfilmentLabel} />
        <ReviewRow label="Date" value={review.pickupDate} />
        <ReviewRow label="Selected time" value={review.selectedTimeLabel} />
      </section>

      {review.delivery ? (
        <section className="space-y-1 py-3">
          <p className="text-ink text-xs font-semibold tracking-wide uppercase">
            Delivery
          </p>
          <ReviewRow label="Recipient" value={review.delivery.recipientName} />
          <ReviewRow label="Phone" value={review.delivery.recipientPhone} />
          <ReviewRow label="Address" value={review.delivery.addressLine1} />
          <ReviewRow label="Address 2" value={review.delivery.addressLine2} />
          <ReviewRow label="Postcode" value={review.delivery.postcode} />
          <ReviewRow
            label="City / state"
            value={`${review.delivery.city} ${review.delivery.state}`.trim()}
          />
          <ReviewRow
            label="Notification"
            value={review.delivery.notifyPreference}
          />
        </section>
      ) : null}

      {review.dineIn ? (
        <section className="space-y-1 py-3">
          <p className="text-ink text-xs font-semibold tracking-wide uppercase">
            Dine-in
          </p>
          <ReviewRow label="Venue" value={review.dineIn.venue} />
          <ReviewRow
            label="Reservation time"
            value={review.dineIn.reservationTime}
          />
          <ReviewRow
            label="Cake serving time"
            value={review.dineIn.servingTime}
          />
          <ReviewRow label="Guest count" value={review.dineIn.guestCount} />
          <ReviewRow label="Note" value={review.dineIn.note} />
        </section>
      ) : null}

      <section className="space-y-1 py-3">
        <p className="text-ink text-xs font-semibold tracking-wide uppercase">
          Options
        </p>
        {review.complimentary.length === 0 && review.paidAddons.length === 0 ? (
          <p className="text-skyline text-sm">None selected</p>
        ) : null}
        {review.complimentary.map((item) => (
          <p className="text-ink text-sm" key={item.name}>
            {item.name} × {item.quantity}
          </p>
        ))}
        {review.paidAddons.map((addon) => (
          <div key={addon.name}>
            <p className="text-ink text-sm">
              {addon.name} × {addon.quantity}
              {addon.unitPrice > 0 ? ` · ${formatRm(addon.unitPrice)}` : ""}
            </p>
            {addon.messages.map((message) => (
              <p className="text-skyline text-xs" key={message}>
                {message}
              </p>
            ))}
          </div>
        ))}
      </section>

      <section className="space-y-1 py-3">
        <p className="text-ink text-xs font-semibold tracking-wide uppercase">
          Notes
        </p>
        <ReviewRow label="Customer note" value={review.customerNote} />
        <ReviewRow
          label="Receipt copy"
          value={
            review.includeReceipt == null
              ? null
              : review.includeReceipt
                ? "Requested"
                : "Not requested"
          }
        />
      </section>

      <section className="space-y-1 pt-3">
        <p className="text-ink text-xs font-semibold tracking-wide uppercase">
          Items
        </p>
        {review.items.map((item) => (
          <p
            className="text-ink text-sm"
            key={`${item.cakeName}-${item.sizeLabel}`}
          >
            {waitingListConfirmationItemLine(item)}
            {item.unitPrice > 0
              ? ` · ${formatRm(item.unitPrice * item.quantity)}`
              : ""}
          </p>
        ))}
        <p className="text-ink pt-1 text-sm font-medium">
          Total {review.reviewTotalLabel}
        </p>
      </section>
    </div>
  );
}
