import { handleManagementReportExport } from "@/workspaces/owner/reports/export/route-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleManagementReportExport(request, "xlsx");
}
