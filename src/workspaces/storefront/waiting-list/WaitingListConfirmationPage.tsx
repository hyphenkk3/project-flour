import Link from "next/link";
import {
  WAITING_LIST_CONFIRMATION_ALREADY_BODY,
  WAITING_LIST_CONFIRMATION_ALREADY_TITLE,
  WAITING_LIST_CONFIRMATION_EXPIRED_CONTACT,
  WAITING_LIST_CONFIRMATION_EXPIRED_TITLE,
  WAITING_LIST_CONFIRMATION_UNAVAILABLE_BODY,
  WAITING_LIST_CONFIRMATION_UNAVAILABLE_TITLE,
  waitingListConfirmationExpiredDeadlineSentence,
} from "@/engines/waiting-list/confirmation-page";
import { StorefrontHomeLink } from "@/workspaces/storefront/StorefrontBrand";
import { StorefrontTheme } from "@/workspaces/storefront/StorefrontTheme";
import { WaitingListConfirmationForm } from "@/workspaces/storefront/waiting-list/WaitingListConfirmationForm";
import { loadWaitingListConfirmationPage } from "@/workspaces/storefront/waiting-list/confirmation-actions";

type WaitingListConfirmationPageProps = {
  token: string;
};

function ConfirmationStatus({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="text-center">
      <h1 className="font-display text-ink text-3xl tracking-tight">{title}</h1>
      <p className="text-skyline mt-4 text-base leading-relaxed">{body}</p>
    </div>
  );
}

export async function WaitingListConfirmationPage({
  token,
}: WaitingListConfirmationPageProps) {
  const model = await loadWaitingListConfirmationPage(token);

  return (
    <main className="bg-paper mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-10 sm:px-6 sm:py-16">
      <StorefrontTheme />
      <StorefrontHomeLink />
      <div className="mt-10">
        {model.kind === "form" ? (
          <WaitingListConfirmationForm
            closedDates={model.closedDates}
            complimentaryOptions={model.complimentaryOptions}
            expiresAt={model.expiresAt}
            guestName={model.guestName}
            guestPhone={model.guestPhone}
            hoursSnapshot={model.hoursSnapshot}
            items={model.items}
            optionsReady={model.optionsReady}
            paidAddonOptions={model.paidAddonOptions}
            pickupDate={model.pickupDate}
            token={model.token}
          />
        ) : model.kind === "submitted" ? (
          <ConfirmationStatus
            body={WAITING_LIST_CONFIRMATION_ALREADY_BODY}
            title={WAITING_LIST_CONFIRMATION_ALREADY_TITLE}
          />
        ) : model.kind === "expired" ? (
          <ConfirmationStatus
            body={`${
              model.expiresAt
                ? `${waitingListConfirmationExpiredDeadlineSentence(model.expiresAt)} `
                : ""
            }${WAITING_LIST_CONFIRMATION_EXPIRED_CONTACT}`}
            title={WAITING_LIST_CONFIRMATION_EXPIRED_TITLE}
          />
        ) : (
          <ConfirmationStatus
            body={WAITING_LIST_CONFIRMATION_UNAVAILABLE_BODY}
            title={WAITING_LIST_CONFIRMATION_UNAVAILABLE_TITLE}
          />
        )}
      </div>
      <div className="mt-10 text-center">
        <Link className="text-signal text-sm font-medium underline" href="/order">
          Back to Order
        </Link>
      </div>
    </main>
  );
}
