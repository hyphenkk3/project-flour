import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import {
  isReportOwner,
  previousMonth,
  reportMonth,
} from "@/engines/reports/monthly";
import { loadManagementReport } from "@/workspaces/owner/reports/queries";
import { ManagementReportDashboard } from "@/workspaces/owner/reports/ManagementReportDashboard";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const staff = await requireStaff();
  if (!isReportOwner(staff.role.code)) redirect("/home");
  const params = await searchParams;
  const current = reportMonth(new Date());
  const defaultMonth = previousMonth(current);
  const month = params.month ?? defaultMonth;
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    month > current ||
    month < "2020-01"
  ) {
    return (
      <main>
        <h1 className="text-2xl font-semibold">Invalid report month</h1>
        <Link href="/owner/management/reports">Return to reports</Link>
      </main>
    );
  }
  const report = await loadManagementReport(month);
  return <ManagementReportDashboard report={report} />;
}
