import { Suspense } from "react";
import Link from "next/link";
import {
  FRESH_PICKS_SUCCESS_CONTACT,
  FRESH_PICKS_SUCCESS_FLOW,
  FRESH_PICKS_SUCCESS_PAYMENT,
  FRESH_PICKS_SUCCESS_TITLE,
} from "@/engines/extra/customer-fresh-picks";
import { ClearPreorderDraftOnSuccess } from "@/workspaces/storefront/checkout/ClearPreorderDraft";
import { ClearFreshPickCartOnSuccess } from "@/workspaces/storefront/extra/ClearFreshPickCartOnSuccess";
import { getGuestPreorderReceipt } from "@/workspaces/storefront/checkout/receipt";
import { loadSuccessPageReceipt } from "@/workspaces/storefront/checkout/success-page-load";
import {
  ORDER_DETAILS_CARD_CONTACT,
  ORDER_DETAILS_CARD_PAYMENT,
  ORDER_DETAILS_NOTICE_TITLE,
  orderDetailsNoticeBody,
  orderDetailsNoticeMark,
} from "@/workspaces/storefront/checkout/order-details-card";
import { SuccessReceiptRecap } from "@/workspaces/storefront/checkout/SuccessReceiptRecap";
import { storefrontKickerClass } from "@/workspaces/storefront/StorefrontBrand";
import { ApplySelectedCatalogueVoucher } from "@/workspaces/storefront/offers/ApplySelectedCatalogueVoucher";
import { CATALOGUE_VOUCHER_ADJUSTMENT_CODE } from "@/types/catalogue-voucher";
import { StorefrontSuccessPerfProbe } from "@/workspaces/storefront/checkout/StorefrontSuccessPerfProbe";

type StorefrontSuccessPageProps = {
  orderId?: string;
  flow?: string;
};

function successCopy(isFreshPick: boolean) {
  return {
    title: isFreshPick ? FRESH_PICKS_SUCCESS_TITLE : "Order Received",
    paymentStatus: isFreshPick
      ? FRESH_PICKS_SUCCESS_PAYMENT
      : ORDER_DETAILS_CARD_PAYMENT,
    contactLine: isFreshPick
      ? FRESH_PICKS_SUCCESS_CONTACT
      : ORDER_DETAILS_CARD_CONTACT,
  };
}

export async function StorefrontSuccessPage({
  orderId,
  flow,
}: StorefrontSuccessPageProps) {
  const isFreshPick = flow === FRESH_PICKS_SUCCESS_FLOW;
  const { title, paymentStatus, contactLine } = successCopy(isFreshPick);
  const noticeBody = orderDetailsNoticeBody(isFreshPick);
  const noticeMark = orderDetailsNoticeMark(isFreshPick);
  const noticeMarkAt = noticeBody.indexOf(noticeMark);

  return (
    <main className="bg-paper mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-16 sm:px-6">
      <StorefrontSuccessPerfProbe markVisible />
      {isFreshPick ? <ClearFreshPickCartOnSuccess /> : <ClearPreorderDraftOnSuccess />}
      <div className="text-center">
        <p className={storefrontKickerClass}>Whitebird</p>
        <h1 className="font-display text-ink mt-3 text-3xl tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="text-skyline mt-4 text-base leading-relaxed">
          {paymentStatus}
          <br />
          {contactLine}
        </p>
      </div>

      <aside
        aria-label={ORDER_DETAILS_NOTICE_TITLE}
        className="border-fog mt-8 rounded-xl border bg-white px-4 py-3.5 text-left sm:px-5 sm:py-4"
      >
        <p className="text-signal text-[11px] font-semibold tracking-[0.16em] uppercase">
          {ORDER_DETAILS_NOTICE_TITLE}
        </p>
        <p className="text-skyline mt-2 text-sm leading-relaxed sm:text-[15px]">
          {noticeMarkAt >= 0 ? (
            <>
              {noticeBody.slice(0, noticeMarkAt)}
              <span className="text-ink font-semibold">{noticeMark}</span>
              {noticeBody.slice(noticeMarkAt + noticeMark.length)}
            </>
          ) : (
            noticeBody
          )}
        </p>
      </aside>

      <Suspense
        fallback={
          <div
            aria-hidden
            className="border-fog mt-8 min-h-40 border-t pt-8"
          />
        }
      >
        <SuccessReceiptSection orderId={orderId} />
      </Suspense>

      <section className="mt-8 space-y-2 text-left text-sm">
        {isFreshPick ? (
          <>
            <p className="text-ink flex items-start gap-2 font-medium">
              <span aria-hidden className="text-status-success">
                ✓
              </span>
              {FRESH_PICKS_SUCCESS_TITLE}
            </p>
            <p className="text-skyline flex items-start gap-2 pl-5">
              {FRESH_PICKS_SUCCESS_PAYMENT}
            </p>
            <p className="text-skyline flex items-start gap-2 pl-5">
              {FRESH_PICKS_SUCCESS_CONTACT}
            </p>
          </>
        ) : (
          <>
            <p className="text-ink flex items-start gap-2 font-medium">
              <span aria-hidden className="text-status-success">
                ✓
              </span>
              Order Received
            </p>
            <p className="text-skyline flex items-start gap-2 pl-5">
              {ORDER_DETAILS_CARD_PAYMENT}
            </p>
            <p className="text-skyline flex items-start gap-2 pl-5">
              {ORDER_DETAILS_CARD_CONTACT}
            </p>
          </>
        )}
      </section>

      <div className="mt-10 text-center">
        {isFreshPick ? (
          <Link
            className="text-ink decoration-fog hover:text-skyline text-sm font-medium underline underline-offset-4 transition-colors duration-200"
            href="/extra"
          >
            Back to Fresh Picks
          </Link>
        ) : (
          <Link
            className="text-ink decoration-fog hover:text-skyline text-sm font-medium underline underline-offset-4 transition-colors duration-200"
            href="/"
          >
            Back to collection
          </Link>
        )}
      </div>
    </main>
  );
}

async function SuccessReceiptSection({
  orderId,
}: Pick<StorefrontSuccessPageProps, "orderId">) {
  const { receipt, perf } = await loadSuccessPageReceipt(
    orderId,
    getGuestPreorderReceipt,
  );
  return (
    <>
      <StorefrontSuccessPerfProbe successServer={perf} />
      <ApplySelectedCatalogueVoucher
        alreadyApplied={Boolean(
          receipt?.adjustments.some(
            (row) => row.code === CATALOGUE_VOUCHER_ADJUSTMENT_CODE,
          ),
        )}
        orderId={orderId}
      />
      {receipt ? (
        <SuccessReceiptRecap orderId={orderId} receipt={receipt} />
      ) : null}
    </>
  );
}
