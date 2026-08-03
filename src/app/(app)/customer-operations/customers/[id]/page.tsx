import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/shell/EmptyState";
import { PageHeader } from "@/components/shell/PageHeader";
import { DeleteAddressButton } from "@/workspaces/customer-operations/customers/DeleteAddressButton";
import {
  customerIdentityLabel,
  customerInitials,
  formatCustomerDate,
  formatWhatsAppDisplay,
  phoneLastFour,
} from "@/workspaces/customer-operations/customers/normalize";
import {
  getCustomerById,
  listCustomerAddresses,
} from "@/workspaces/customer-operations/customers/queries";
import { preferredContactLabel } from "@/workspaces/customer-operations/customers/ui-shared";

export const dynamic = "force-dynamic";

type CustomerProfilePageProps = {
  params: Promise<{ id: string }>;
};

export default async function CustomerProfilePage({
  params,
}: CustomerProfilePageProps) {
  const { id } = await params;
  const customer = await getCustomerById(id);

  if (!customer) {
    notFound();
  }

  const addresses = await listCustomerAddresses(customer.id);
  const identity = customerIdentityLabel(
    customer.fullName,
    customer.phoneNumber,
    customer.phoneNormalized,
  );
  const lastFour = phoneLastFour(
    customer.phoneNumber,
    customer.phoneNormalized,
  );
  const initials = customerInitials(customer.fullName);
  const whatsapp = formatWhatsAppDisplay(customer.whatsappUsername);
  const preferred = preferredContactLabel(customer.preferredContact);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="bg-mist text-signal mt-1 flex size-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          >
            {initials}
          </span>
          <div className="min-w-0">
            <PageHeader
              description={
                lastFour
                  ? `${identity} · Preferred ${preferred}`
                  : `Preferred · ${preferred}`
              }
              title={customer.fullName}
            />
          </div>
        </div>
        <Link
          className="border-fog text-ink inline-flex min-h-12 items-center justify-center rounded-lg border bg-white px-5 text-sm font-medium"
          href={`/customer-operations/customers/${customer.id}/edit`}
        >
          Edit customer
        </Link>
      </div>

      <section className="border-fog rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="text-ink text-sm font-semibold">Contact</h3>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-skyline text-xs tracking-wide uppercase">
              Phone
            </dt>
            <dd className="text-ink mt-1 text-sm break-words">
              {customer.phoneNumber ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-skyline text-xs tracking-wide uppercase">
              WhatsApp
            </dt>
            <dd className="text-ink mt-1 text-sm break-words">
              {whatsapp ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-skyline text-xs tracking-wide uppercase">
              Email
            </dt>
            <dd className="text-ink mt-1 text-sm break-words">
              {customer.email ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-skyline text-xs tracking-wide uppercase">
              Preferred
            </dt>
            <dd className="text-ink mt-1 text-sm">
              {preferredContactLabel(customer.preferredContact)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-ink text-sm font-semibold">Addresses</h3>
          <Link
            className="border-fog text-ink inline-flex min-h-11 items-center rounded-lg border bg-white px-4 text-sm font-medium"
            href={`/customer-operations/customers/${customer.id}/addresses/new`}
          >
            Add address
          </Link>
        </div>

        {addresses.length === 0 ? (
          <EmptyState
            compact
            description="Add a delivery or collection address for this customer."
            title="No addresses yet."
          />
        ) : (
          <ul className="grid gap-3">
            {addresses.map((address) => (
              <li
                className="border-fog rounded-2xl border bg-white p-4 shadow-sm"
                key={address.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-ink font-medium">
                      {address.label}
                      {address.isDefault ? (
                        <span className="bg-mist text-signal ml-2 inline-flex rounded-md px-2 py-0.5 text-xs font-medium">
                          Default
                        </span>
                      ) : null}
                    </p>
                    <p className="text-skyline mt-1 text-sm">
                      {address.recipientName}
                      {address.phoneNumber ? ` · ${address.phoneNumber}` : ""}
                    </p>
                    <p className="text-ink mt-2 text-sm break-words">
                      {address.addressLine1}
                      {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                    </p>
                    <p className="text-ink text-sm break-words">
                      {address.postcode} {address.city}, {address.state}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <Link
                      className="text-signal inline-flex min-h-11 items-center text-sm font-medium"
                      href={`/customer-operations/customers/${customer.id}/addresses/${address.id}/edit`}
                    >
                      Edit
                    </Link>
                    <DeleteAddressButton
                      addressId={address.id}
                      addressLabel={address.label}
                      customerId={customer.id}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-fog rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="text-ink text-sm font-semibold">Notes</h3>
        <p className="text-ink mt-3 text-sm whitespace-pre-wrap">
          {customer.notes?.trim() ? customer.notes : "No notes yet."}
        </p>
      </section>

      <section className="text-skyline grid gap-2 text-xs sm:grid-cols-2">
        <p>Created · {formatCustomerDate(customer.createdAt)}</p>
        <p>Updated · {formatCustomerDate(customer.updatedAt)}</p>
      </section>

      <section className="space-y-2">
        <div className="border-fog rounded-xl border border-dashed bg-white/50 px-4 py-3">
          <h3 className="text-ink text-sm font-medium">Orders</h3>
          <p className="text-skyline mt-1 text-sm">Coming in V0.3</p>
        </div>
        <div className="border-fog rounded-xl border border-dashed bg-white/50 px-4 py-3">
          <h3 className="text-ink text-sm font-medium">Timeline</h3>
          <p className="text-skyline mt-1 text-sm">Coming in V0.3</p>
        </div>
      </section>
    </div>
  );
}
