import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageRm10PhysicalCards } from "@/foundation/navigation/access";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatBusinessCalendarDate } from "@/lib/dates";
import { formatLibraryMoney } from "@/workspaces/library/labels";
import {
  findRm10LibraryRowsByNumber,
  rm10LibrarySourceLabel,
  rm10LibraryStatusLabel,
} from "@/engines/vouchers/physical-rm10";
import { VoucherLibraryTabs } from "@/workspaces/library/vouchers/VoucherLibraryTabs";
import { listRm10LibraryRows } from "@/workspaces/library/vouchers/rm10/queries";

export const dynamic = "force-dynamic";

type Rm10VoucherDetailPageProps = {
  params: Promise<{ voucherNumber: string }>;
};

function formatExpiry(value: string | null): string {
  return value ? formatBusinessCalendarDate(value) : "—";
}

function formatCalendar(value: string | null | undefined): string {
  if (!value || value === "—") return "—";
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? formatBusinessCalendarDate(value)
    : value;
}

export default async function LibraryRm10VoucherDetailPage({
  params,
}: Rm10VoucherDetailPageProps) {
  const staff = await requireStaff();
  if (!canManageRm10PhysicalCards(staff.role.code)) {
    redirect("/library/vouchers");
  }

  const { voucherNumber } = await params;
  const decoded = decodeURIComponent(voucherNumber);
  const matches = findRm10LibraryRowsByNumber(
    await listRm10LibraryRows(),
    decoded,
  );

  if (matches.length === 0) {
    notFound();
  }

  const primary = matches[0];
  const used = matches.find((row) => row.status === "used") ?? primary;

  return (
    <div className="space-y-6">
      <VoucherLibraryTabs active="rm10" showRm10 />
      <div>
        <Link
          className="text-skyline hover:text-ink text-sm font-medium"
          href="/library/vouchers/rm10"
        >
          ← RM10 Physical Cards
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge
            label={rm10LibraryStatusLabel(used.status)}
            tone={
              used.status === "available"
                ? "success"
                : used.status === "used"
                  ? "info"
                  : "warning"
            }
          />
          {used.source === "historical" ? (
            <StatusBadge
              label={rm10LibrarySourceLabel(used.source)}
              tone="neutral"
            />
          ) : null}
        </div>
        <PageHeader title="RM10 Physical Card" />
      </div>

      {matches.some((row) => row.duplicateRedemption) ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          More than one effective RM10 redemption uses this voucher number.
          Both records are shown. They were not merged.
        </p>
      ) : null}

      {matches.map((row) => (
        <dl
          className="border-fog grid gap-4 rounded-xl border bg-white p-5 text-sm sm:grid-cols-2"
          key={row.key}
        >
          <div>
            <dt className="text-skyline">Voucher No.</dt>
            <dd className="text-ink mt-1 font-medium">{row.voucherNumber}</dd>
          </div>
          <div>
            <dt className="text-skyline">Status</dt>
            <dd className="text-ink mt-1">
              {rm10LibraryStatusLabel(row.status)}
              {row.source === "historical" ? " · Historical" : ""}
            </dd>
          </div>
          <div>
            <dt className="text-skyline">Expiry</dt>
            <dd className="text-ink mt-1">{formatExpiry(row.expiryDate)}</dd>
          </div>
          <div>
            <dt className="text-skyline">Redeemed</dt>
            <dd className="text-ink mt-1">
              {row.redemption
                ? formatCalendar(row.redemption.redeemedDate)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-skyline">Order</dt>
            <dd className="text-ink mt-1">
              {row.redemption?.orderNumber ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-skyline">Customer</dt>
            <dd className="text-ink mt-1">
              {row.redemption?.customerName ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-skyline">Order Date</dt>
            <dd className="text-ink mt-1">
              {row.redemption ? formatCalendar(row.redemption.orderDate) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-skyline">Fulfilment</dt>
            <dd className="text-ink mt-1">
              {row.redemption
                ? [
                    formatCalendar(row.redemption.fulfilmentDate),
                    row.redemption.fulfilmentMethodLabel,
                  ]
                    .filter((part) => part && part !== "—")
                    .join(" · ") || "—"
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-skyline">Discount</dt>
            <dd className="text-ink mt-1">
              {row.redemption
                ? `-${formatLibraryMoney(Math.abs(row.redemption.discountAmount))}`
                : "—"}
            </dd>
          </div>
          {row.redemption ? (
            <div className="sm:col-span-2">
              <Link
                className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium"
                href={`/owner/orders/${row.redemption.orderId}`}
              >
                View Order
              </Link>
            </div>
          ) : null}
        </dl>
      ))}
    </div>
  );
}
