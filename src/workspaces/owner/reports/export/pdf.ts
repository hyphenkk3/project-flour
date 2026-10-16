import "server-only";
import type { ExportCell, ExportSheet } from "@/engines/reports/export-data";
import type { ManagementReportData } from "@/engines/reports/export-data";
import { buildManagementReportExportSheets } from "@/engines/reports/export-data";
import PDFDocument from "pdfkit";

type CellValue = string | number | null;
type CellInfo = { value: CellValue; kind?: "currency" | "percentage" | "integer" | "date" };
type Column = ExportSheet["columns"][number];

const margin = 42;
const pageBottom = 800;
const teal = "#0f5c59";
const slate = "#263445";
const muted = "#64748b";
const line = "#d8e1e8";

function cellInfo(cell: ExportCell): CellInfo {
  return typeof cell === "object" && cell !== null
    ? cell
    : { value: cell };
}

function formatCell(cell: ExportCell, column: Column): string {
  const value = cellInfo(cell).value;
  const kind = cellInfo(cell).kind ?? column.kind;
  if (value === null || value === "") return "—";
  if (kind === "currency" && typeof value === "number")
    return `RM ${new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
  if (kind === "percentage" && typeof value === "number")
    return `${new Intl.NumberFormat("en-MY", { maximumFractionDigits: 1 }).format(value * 100)}%`;
  if (kind === "integer" && typeof value === "number")
    return new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 }).format(value);
  if (kind === "date" && typeof value === "string")
    return new Intl.DateTimeFormat("en-MY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00Z`));
  return String(value);
}

function splitLongReason(value: string, maximum = 360): string[] {
  const chunks: string[] = [];
  let remaining = value;
  while (remaining.length > maximum) {
    const breakAt = remaining.lastIndexOf(" ", maximum);
    const splitAt = breakAt >= maximum / 2 ? breakAt : maximum;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  chunks.push(remaining);
  return chunks;
}

function reportMonthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

function pdfBytes(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export async function generateManagementReportPdf(
  report: ManagementReportData,
): Promise<Buffer> {
  const sheets = buildManagementReportExportSheets(report);
  const byName = new Map(sheets.map((sheet) => [sheet.name, sheet]));
  const doc = new PDFDocument({
    size: "A4",
    margin,
    autoFirstPage: false,
    bufferPages: true,
    compress: true,
    info: {
      Title: `Whitebird Management Report ${report.current.month}`,
      Author: "Whitebird",
      Subject: "Live management report",
      CreationDate: new Date(report.asOf),
    },
  });
  const output = pdfBytes(doc);
  let contentWidth = 0;

  const addPage = () => {
    doc.addPage();
    contentWidth = doc.page.width - margin * 2;
    doc.save();
    doc.strokeColor(line).lineWidth(0.7).moveTo(margin, 37).lineTo(doc.page.width - margin, 37).stroke();
    doc.font("Helvetica-Bold").fontSize(9).fillColor(teal).text("WHITEBIRD", margin, 20, { characterSpacing: 1.1 });
    doc.restore();
    doc.y = 51;
  };

  const ensureSpace = (height: number, repeat?: () => void) => {
    if (doc.y + height > pageBottom - margin) {
      addPage();
      repeat?.();
    }
  };

  const sectionHeading = (title: string, followingHeight = 0) => {
    ensureSpace(34 + followingHeight);
    doc.moveDown(0.7);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(teal).text(title, margin, doc.y);
    const y = doc.y + 3;
    doc.strokeColor(line).lineWidth(0.6).moveTo(margin, y).lineTo(doc.page.width - margin, y).stroke();
    doc.y = y + 9;
  };

  const drawTable = (
    title: string,
    columns: Column[],
    rows: ExportCell[][],
    widths?: number[],
  ) => {
    const defaultWidth = contentWidth / columns.length;
    const columnWidths = widths ?? columns.map((column) => column.width ?? defaultWidth);
    const totalWidth = columnWidths.reduce((total, width) => total + width, 0);
    const fittedWidths = columnWidths.map((width) => width * (contentWidth / totalWidth));
    const left = margin;
    const fontSize = 8.2;
    const padding = 4;
    const headerHeight = Math.max(
        22,
        ...columns.map((column, index) => {
          doc.font("Helvetica-Bold").fontSize(fontSize);
          return doc.heightOfString(column.header, { width: fittedWidths[index] - padding * 2 }) + 8;
        }),
      );
    sectionHeading(title, headerHeight + 28);
    const drawHeader = () => {
      const headerY = doc.y;
      doc.fillColor("#edf4f5").rect(left, headerY, contentWidth, headerHeight).fill();
      let x = left;
      columns.forEach((column, index) => {
        doc.font("Helvetica-Bold").fontSize(fontSize).fillColor(slate).text(
          column.header,
          x + padding,
          headerY + 4,
          { width: fittedWidths[index] - padding * 2, height: headerHeight - 8 },
        );
        x += fittedWidths[index];
      });
      doc.y = headerY + headerHeight;
    };
    drawHeader();
    rows.forEach((row, rowIndex) => {
      const texts = columns.map((column, columnIndex) => formatCell(row[columnIndex] ?? null, column));
      doc.font("Helvetica").fontSize(fontSize);
      const height = Math.max(
        21,
        ...texts.map((text, index) =>
          doc.heightOfString(text, {
            width: fittedWidths[index] - padding * 2,
            lineGap: 1,
          }) + padding * 2,
        ),
      );
      ensureSpace(height + 2, drawHeader);
      const rowY = doc.y;
      if (rowIndex % 2 === 1)
        doc.fillColor("#f8fafc").rect(left, rowY, contentWidth, height).fill();
      doc.strokeColor(line).lineWidth(0.4).moveTo(left, rowY + height).lineTo(left + contentWidth, rowY + height).stroke();
      let x = left;
      texts.forEach((text, index) => {
        const rightAligned = ["currency", "percentage", "integer"].includes(
          cellInfo(row[index] ?? null).kind ?? columns[index].kind ?? "",
        );
        doc.font("Helvetica").fontSize(fontSize).fillColor(slate).text(text, x + padding, rowY + padding, {
          width: fittedWidths[index] - padding * 2,
          height: height - padding,
          lineGap: 1,
          align: rightAligned ? "right" : "left",
        });
        x += fittedWidths[index];
      });
      doc.y = rowY + height;
    });
    doc.y += 7;
  };

  addPage();
  doc.font("Helvetica-Bold").fontSize(23).fillColor(slate).text("Management Report");
  doc.moveDown(0.2);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(teal).text(reportMonthLabel(report.current.month));
  doc.moveDown(0.35);
  doc.font("Helvetica").fontSize(9).fillColor(muted).text(
    `Generated ${new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuching" }).format(new Date(report.asOf))}`,
  );
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(8.4).fillColor(muted).text(
    "Live report: figures reflect recorded information at generation time. Later amendments, fulfilment, corrections or refunds may change a subsequently generated report.",
    { width: contentWidth, lineGap: 2 },
  );
  doc.moveDown(0.9);

  const summary = byName.get("Summary")!;
  const revenueRows = summary.rows.filter((row) => row[0] === "Revenue");
  const overviewRows = summary.rows.filter((row) => row[0] === "Orders" || row[0] === "Payments");
  const netSalesCell = revenueRows.find((row) => row[1] === "Fulfilled Net Sales")?.[2] ?? null;
  const netSalesValue = formatCell(netSalesCell, { header: "", kind: "currency" });
  ensureSpace(68);
  const heroY = doc.y;
  doc.fillColor("#eef7f6").roundedRect(margin, heroY, contentWidth, 68, 7).fill();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(teal).text("FULFILLED NET SALES", margin + 14, heroY + 10, { characterSpacing: 0.4 });
  doc.font("Helvetica-Bold").fontSize(22).fillColor(slate).text(netSalesValue, margin + 14, heroY + 30);
  doc.y = heroY + 78;
  drawTable("Executive Summary · Revenue", [
    { header: "Metric", width: 66 },
    { header: "Value", width: 34, kind: "currency" },
    { header: "Notes", width: 70 },
  ], revenueRows.map((row) => [row[1]!, row[2]!, row[3]!]));
  drawTable("Executive Summary · Orders and Cash", [
    { header: "Metric", width: 48 },
    { header: "Value", width: 30 },
    { header: "Notes", width: 92 },
  ], overviewRows.map((row) => [row[1]!, row[2]!, row[3]!]));

  const orderStatusRows: ExportCell[][] = [
    ["Fulfilled", { value: report.current.fulfilled, kind: "integer" }, "Included in fulfilled sales"],
    ["Scheduled, not fulfilled", { value: report.current.unfulfilled, kind: "integer" }, { value: report.current.unfulfilledValue, kind: "currency" }],
    ["Cancelled", { value: report.current.cancelled, kind: "integer" }, { value: report.current.cancelledValue, kind: "currency" }],
  ];
  drawTable("A. Order Status", [
    { header: "Status", width: 48 },
    { header: "Orders", width: 24, kind: "integer" },
    { header: "Value / treatment", width: 98 },
  ], orderStatusRows);

  const fulfilment = byName.get("Fulfilment")!;
  const fulfilmentCountColumns = [0, 1, 2, 3, 4, 7, 10];
  drawTable(
    "B. Fulfilment Performance · Orders and Sales",
    fulfilmentCountColumns.map((index) => fulfilment.columns[index]),
    fulfilment.rows.map((row) => fulfilmentCountColumns.map((index) => row[index] ?? null)),
    [70, 68, 68, 68, 68, 100, 55],
  );
  const fulfilmentFinancialColumns = [0, 5, 6, 8, 9, 11, 12];
  drawTable(
    "Fulfilment Performance · Financial Detail",
    fulfilmentFinancialColumns.map((index) => fulfilment.columns[index]),
    fulfilment.rows.map((row) => fulfilmentFinancialColumns.map((index) => row[index] ?? null)),
    [70, 75, 65, 80, 80, 72, 72],
  );

  const cakes = byName.get("Cake Sales")!;
  const cakePdfColumns = [0, 1, 2, 3, 5, 7];
  drawTable(
    "C. Cake Performance · Historical Cake and Size Lines",
    cakePdfColumns.map((index) => cakes.columns[index]),
    cakes.rows.map((row) => cakePdfColumns.map((index) => row[index] ?? null)),
    [150, 52, 55, 85, 82, 87],
  );
  const top = report.current.cakes.slice(0, 10).map((row, index) => [
    { value: index + 1, kind: "integer" },
    row.cakeName,
    row.sizeLabel,
    { value: row.quantity, kind: "integer" },
    { value: row.revenue, kind: "currency" },
  ] as ExportCell[]);
  drawTable("Top-Selling Cake and Size Combinations", [
    { header: "Rank", width: 12, kind: "integer" },
    { header: "Cake", width: 48 },
    { header: "Size", width: 14 },
    { header: "Quantity", width: 16, kind: "integer" },
    { header: "Gross Revenue", width: 28, kind: "currency" },
  ], top);

  const discounts = byName.get("Discounts")!;
  drawTable(
    "D. Discounts",
    discounts.columns,
    discounts.rows.length ? discounts.rows : [["No recorded discounts", null, null, null]],
    [155, 100, 120, 100],
  );
  const sources = byName.get("Order Sources")!;
  drawTable(
    "E. Order Sources",
    sources.columns,
    sources.rows.length ? sources.rows : [["No recorded order sources", null, null, null, null]],
    [115, 60, 90, 130, 105],
  );
  drawTable("Fresh Pick Classification", [
    { header: "Classification", width: 60 },
    { header: "Fulfilled Orders", width: 30, kind: "integer" },
    { header: "Fulfilled Net Sales", width: 40, kind: "currency" },
    { header: "Note", width: 120 },
  ], [["Fresh Pick", { value: report.current.freshPicks.orders, kind: "integer" }, { value: report.current.freshPicks.netSales, kind: "currency" }, "Subset of order-source totals above; included there and not additive."]], [110, 82, 125, 190]);
  drawTable("F. Bookings", byName.get("Bookings")!.columns, byName.get("Bookings")!.rows, [115, 85, 140, 167]);
  drawTable("F. Payments", byName.get("Payments")!.columns, byName.get("Payments")!.rows, [82, 82, 82, 82, 157]);
  const refunds = byName.get("Refund Breakdown")!;
  const refundRows = refunds.rows.length
    ? refunds.rows.flatMap((row) => {
        const reason = String(row[6] ?? "");
        return splitLongReason(reason).map((chunk, index) =>
          index === 0
            ? [...row.slice(0, 6), chunk]
            : [null, null, null, null, null, null, chunk],
        );
      })
    : [["No recorded refunds in the selected month", null, null, null, null, null, null]];
  drawTable(
    "Refund Breakdown",
    refunds.columns,
    refundRows,
    [76, 58, 62, 72, 84, 62, 145],
  );
  drawTable("G. Month-over-Month Comparison", byName.get("Monthly Comparison")!.columns, byName.get("Monthly Comparison")!.rows);
  ensureSpace(40);
  doc.font("Helvetica").fontSize(8).fillColor(muted).text(
    `Outstanding for Selected Month is ${formatCell({ value: report.current.outstandingNow, kind: "currency" }, { header: "" })} as of ${new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuching" }).format(new Date(report.asOf))}. Historical month-end outstanding is not available. This is an internal management report, not an immutable month-end record.`,
    { width: contentWidth, lineGap: 2 },
  );

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    doc.font("Helvetica").fontSize(8).fillColor(muted).text(
      `Whitebird · ${report.current.month} · Page ${index + 1} of ${range.count}`,
      margin,
      doc.page.height - margin - 13,
      { width: contentWidth, align: "right" },
    );
  }
  doc.end();
  return output;
}
