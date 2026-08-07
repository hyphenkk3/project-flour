"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { FormError, FormField, FormInput } from "@/components/ui/form";
import {
  formatCakePrice,
  getCakeDetail,
} from "@/workspaces/customer-website/browse/cake-detail-demo";
import {
  COLLECTION_METHODS,
  createMockOrderReference,
  encodePreorderConfirmation,
  getCollectionMethod,
  MOCK_COLLECTION_DATES,
  MOCK_COLLECTION_TIMES,
  type CollectionMethodId,
  type PreorderConfirmation,
} from "@/workspaces/customer-website/order/order-journey-demo";

type OrderJourneyFormProps = {
  cakeId: string;
  sizeId: string;
  journeyActive?: boolean;
};

export function OrderJourneyForm({
  cakeId,
  sizeId,
  journeyActive = false,
}: OrderJourneyFormProps) {
  const router = useRouter();
  const cake = getCakeDetail(cakeId);
  const size =
    cake?.sizes.find((option) => option.id === sizeId) ?? cake?.sizes[0];

  const [customerName, setCustomerName] = useState(
    journeyActive ? "Amy Chen" : "",
  );
  const [customerPhone, setCustomerPhone] = useState(
    journeyActive ? "9123 4567" : "",
  );
  const [customerEmail, setCustomerEmail] = useState(
    journeyActive ? "amy.chen@email.com" : "",
  );
  const [collectionMethodId, setCollectionMethodId] =
    useState<CollectionMethodId>("take_home");
  const [dateId, setDateId] = useState(
    journeyActive ? "2026-08-21" : (MOCK_COLLECTION_DATES[1]?.id ?? ""),
  );
  const [timeId, setTimeId] = useState(
    journeyActive ? "16:00" : (MOCK_COLLECTION_TIMES[1]?.id ?? ""),
  );
  const [error, setError] = useState<string | null>(null);

  const collectionDates = useMemo(
    () =>
      journeyActive
        ? [
            {
              id: "2026-08-21",
              isoDate: "2026-08-21",
              weekday: "Fri",
              label: "21 August",
            },
            ...MOCK_COLLECTION_DATES,
          ]
        : MOCK_COLLECTION_DATES,
    [journeyActive],
  );
  const collectionTimes = useMemo(
    () =>
      journeyActive
        ? [
            ...MOCK_COLLECTION_TIMES.slice(0, 4),
            { id: "16:00", label: "4:00 pm" },
            ...MOCK_COLLECTION_TIMES.slice(4),
          ]
        : MOCK_COLLECTION_TIMES,
    [journeyActive],
  );

  const selectedDate = useMemo(
    () => collectionDates.find((date) => date.id === dateId),
    [collectionDates, dateId],
  );
  const selectedTime = useMemo(
    () => collectionTimes.find((time) => time.id === timeId),
    [collectionTimes, timeId],
  );
  const selectedMethod = getCollectionMethod(collectionMethodId);

  if (!cake || !size) {
    return (
      <main className="bg-mist min-h-dvh px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-lg space-y-4">
          <h1 className="font-display text-ink text-3xl tracking-tight">
            Choose a cake first
          </h1>
          <p className="text-skyline text-base leading-relaxed">
            This preorder journey needs a cake from Browse Cakes.
          </p>
          <Link
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
            href="/browse"
          >
            Browse Cakes
          </Link>
        </div>
      </main>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const selectedCake = cake;
    const selectedSize = size;
    if (!selectedCake || !selectedSize) {
      setError("Please choose a cake before continuing.");
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      setError("Please add your name and phone number so we can reach you.");
      return;
    }
    if (!selectedDate || !selectedTime || !selectedMethod) {
      setError("Please choose a collection method, date, and time.");
      return;
    }

    const confirmation: PreorderConfirmation = {
      reference: createMockOrderReference(),
      cakeId: selectedCake.id,
      cakeName: selectedCake.name,
      sizeId: selectedSize.id,
      sizeLabel: selectedSize.label,
      serves: selectedSize.serves,
      priceRm: selectedSize.priceRm,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail.trim(),
      collectionMethodId: selectedMethod.id,
      collectionMethodLabel: selectedMethod.label,
      dateId: selectedDate.id,
      dateLabel: `${selectedDate.weekday}, ${selectedDate.label}`,
      timeId: selectedTime.id,
      timeLabel: selectedTime.label,
    };

    const encoded = encodePreorderConfirmation(confirmation);
    router.push(
      journeyActive
        ? `/order/thank-you?c=${encoded}&step=website`
        : `/order/thank-you?c=${encoded}`,
    );
  }

  return (
    <main className="bg-mist min-h-dvh">
      <div className="mx-auto w-full max-w-5xl px-6 pt-8 pb-24 sm:px-10 sm:pt-12 sm:pb-28">
        <Link
          className="text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium transition"
          href={
            journeyActive
              ? `/browse/${cake.id}?step=website`
              : `/browse/${cake.id}`
          }
        >
          ← {cake.name}
        </Link>

        <header className="mt-6 max-w-2xl space-y-3">
          <h1 className="font-display text-ink text-4xl tracking-tight sm:text-5xl">
            Start This Celebration
          </h1>
          <p className="text-skyline text-base leading-relaxed sm:text-lg">
            Tell us a few details. No payment in this step — we&apos;re
            confirming your preorder request.
          </p>
        </header>

        <form
          className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-10"
          onSubmit={handleSubmit}
        >
          <div className="space-y-8">
            <section className="border-fog space-y-4 rounded-3xl border bg-white p-5 sm:p-6">
              <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                Your details
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField htmlFor="customer-name" label="Name">
                  <FormInput
                    autoComplete="name"
                    id="customer-name"
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Your name"
                    required
                    value={customerName}
                  />
                </FormField>
                <FormField htmlFor="customer-phone" label="Phone">
                  <FormInput
                    autoComplete="tel"
                    id="customer-phone"
                    inputMode="tel"
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    placeholder="8-digit mobile"
                    required
                    value={customerPhone}
                  />
                </FormField>
                <FormField
                  className="sm:col-span-2"
                  help="Optional — for order updates."
                  htmlFor="customer-email"
                  label="Email"
                >
                  <FormInput
                    autoComplete="email"
                    id="customer-email"
                    onChange={(event) => setCustomerEmail(event.target.value)}
                    placeholder="you@email.com"
                    type="email"
                    value={customerEmail}
                  />
                </FormField>
              </div>
            </section>

            <section className="border-fog space-y-4 rounded-3xl border bg-white p-5 sm:p-6">
              <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                Collection method
              </h2>
              <ul className="space-y-3">
                {COLLECTION_METHODS.map((method) => {
                  const isSelected = method.id === collectionMethodId;
                  return (
                    <li key={method.id}>
                      <button
                        className={`flex min-h-16 w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                          isSelected
                            ? "border-signal bg-white"
                            : "border-fog hover:border-signal/50 bg-white"
                        }`}
                        onClick={() => setCollectionMethodId(method.id)}
                        type="button"
                      >
                        <span aria-hidden className="text-xl">
                          {method.emoji}
                        </span>
                        <span>
                          <span className="text-ink block text-sm font-medium">
                            {method.label}
                          </span>
                          <span className="text-skyline mt-0.5 block text-sm">
                            {method.description}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="border-fog space-y-4 rounded-3xl border bg-white p-5 sm:p-6">
              <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                Collection date
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {collectionDates.map((date) => {
                  const isSelected = date.id === dateId;
                  return (
                    <li key={date.id}>
                      <button
                        className={`flex min-h-16 w-full flex-col items-start justify-center rounded-2xl border px-3 py-2 text-left transition ${
                          isSelected
                            ? "border-signal bg-white"
                            : "border-fog hover:border-signal/50 bg-white"
                        }`}
                        onClick={() => setDateId(date.id)}
                        type="button"
                      >
                        <span className="text-skyline text-xs font-medium tracking-wide uppercase">
                          {date.weekday}
                        </span>
                        <span className="text-ink text-sm font-medium">
                          {date.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="border-fog space-y-4 rounded-3xl border bg-white p-5 sm:p-6">
              <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                Collection time
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {collectionTimes.map((time) => {
                  const isSelected = time.id === timeId;
                  return (
                    <li key={time.id}>
                      <button
                        className={`flex min-h-12 w-full items-center justify-center rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                          isSelected
                            ? "border-signal text-ink bg-white"
                            : "border-fog text-skyline hover:border-signal/50 bg-white"
                        }`}
                        onClick={() => setTimeId(time.id)}
                        type="button"
                      >
                        {time.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <FormError message={error} />

            <button
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-6 text-base font-medium transition lg:hidden"
              type="submit"
            >
              Send Preorder Request
            </button>
          </div>

          <aside className="border-fog space-y-5 rounded-3xl border bg-white p-5 sm:p-6 lg:sticky lg:top-8">
            <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
              Order summary
            </h2>
            <div className="space-y-1">
              <p className="font-display text-ink text-2xl tracking-tight">
                {cake.name}
              </p>
              <p className="text-skyline text-sm">
                {size.label} · {size.serves}
              </p>
            </div>
            <dl className="text-skyline space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt>Method</dt>
                <dd className="text-ink text-right font-medium">
                  {selectedMethod?.label ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Date</dt>
                <dd className="text-ink text-right font-medium">
                  {selectedDate
                    ? `${selectedDate.weekday}, ${selectedDate.label}`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Time</dt>
                <dd className="text-ink text-right font-medium">
                  {selectedTime?.label ?? "—"}
                </dd>
              </div>
            </dl>
            <div className="border-fog flex items-end justify-between border-t pt-4">
              <span className="text-skyline text-sm">Total</span>
              <span className="font-display text-ink text-3xl tracking-tight">
                {formatCakePrice(size.priceRm)}
              </span>
            </div>
            <p className="text-skyline text-xs leading-relaxed">
              Mock preorder only — no payment collected in this version.
            </p>
            <button
              className="bg-ink text-mist hover:bg-skyline hidden min-h-14 w-full items-center justify-center rounded-2xl px-6 text-base font-medium transition lg:inline-flex"
              type="submit"
            >
              Send Preorder Request
            </button>
          </aside>
        </form>
      </div>
    </main>
  );
}
