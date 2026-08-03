import Link from "next/link";
import type { Customer } from "@/types/customer";
import {
  customerIdentityLabel,
  customerInitials,
  formatCustomerDate,
  formatWhatsAppDisplay,
} from "@/workspaces/customer-operations/customers/normalize";
import { preferredContactLabel } from "@/workspaces/customer-operations/customers/ui-shared";

type CustomerCardProps = {
  customer: Customer;
};

export function CustomerCard({ customer }: CustomerCardProps) {
  const identity = customerIdentityLabel(
    customer.fullName,
    customer.phoneNumber,
    customer.phoneNormalized,
  );
  const initials = customerInitials(customer.fullName);
  const whatsapp = formatWhatsAppDisplay(customer.whatsappUsername);

  return (
    <Link
      className="border-fog hover:border-signal block rounded-2xl border bg-white p-4 shadow-sm transition"
      href={`/customer-operations/customers/${customer.id}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="bg-mist text-signal flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-base font-semibold">
            {identity}
          </p>
          <dl className="text-skyline mt-2.5 space-y-1 text-sm">
            {customer.phoneNumber ? (
              <div>
                <dt className="sr-only">Phone</dt>
                <dd className="truncate">Phone · {customer.phoneNumber}</dd>
              </div>
            ) : null}
            {whatsapp ? (
              <div>
                <dt className="sr-only">WhatsApp</dt>
                <dd className="truncate">WhatsApp · {whatsapp}</dd>
              </div>
            ) : null}
            {customer.email ? (
              <div>
                <dt className="sr-only">Email</dt>
                <dd className="truncate">Email · {customer.email}</dd>
              </div>
            ) : null}
            <div>
              <dt className="sr-only">Preferred contact</dt>
              <dd>
                Preferred · {preferredContactLabel(customer.preferredContact)}
              </dd>
            </div>
            <div>
              <dt className="sr-only">Created</dt>
              <dd>Added · {formatCustomerDate(customer.createdAt)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </Link>
  );
}
