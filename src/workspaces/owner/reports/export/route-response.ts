import "server-only";
import { getSessionStaff } from "@/foundation/auth/session";
import {
  isReportOwner,
  nextMonth,
  reportMonth,
} from "@/engines/reports/monthly";
import { loadManagementReport } from "@/workspaces/owner/reports/queries";
import { generateManagementReportPdf } from "./pdf";
import { generateManagementReportXlsx } from "./xlsx";

export type ReportExportFormat = "pdf" | "xlsx";

export async function handleManagementReportExport(
  request: Request,
  format: ReportExportFormat,
): Promise<Response> {
  const staff = await getSessionStaff();
  if (!staff)
    return Response.json({ error: "Sign in to export reports." }, { status: 401 });
  if (!isReportOwner(staff.role.code))
    return Response.json({ error: "Owner access is required." }, { status: 403 });

  const url = new URL(request.url);
  const month = url.searchParams.get("month") ?? "";
  const latestMonth = reportMonth(new Date());
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    month < "2020-01" ||
    month > latestMonth ||
    nextMonth(month) <= month
  ) {
    return Response.json({ error: "Choose a valid reporting month." }, { status: 400 });
  }

  try {
    const report = await loadManagementReport(month);
    const body =
      format === "pdf"
        ? await generateManagementReportPdf(report)
        : generateManagementReportXlsx(report);
    const extension = format === "pdf" ? "pdf" : "xlsx";
    const contentType =
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="Whitebird_Report_${month}.${extension}"`,
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "The report export could not be generated. Please retry." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
