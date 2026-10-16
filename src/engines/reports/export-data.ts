import {
  percentChange,
  type buildMonthlyReport,
} from "@/engines/reports/monthly";
import {
  assertRefundBreakdownReconciles,
  type RefundBreakdownEntry,
} from "@/engines/reports/refund-breakdown";
import { paymentMethodDisplayLabel } from "@/engines/orders/payment-details";

type MonthlyReport = ReturnType<typeof buildMonthlyReport>;

export type ManagementReportData = {
  current: MonthlyReport;
  previous: MonthlyReport;
  bookings: {
    count: number;
    value: number;
    sources: Array<{ source: string; count: number }>;
  };
  payments: {
    collected: number;
    refunds: number;
    netReceipts: number;
    methods: Array<{ method: string; value: number }>;
  };
  refundBreakdown: RefundBreakdownEntry[];
  asOf: string;
};

export type ExportCell =
  | string
  | number
  | null
  | { value: string | number | null; kind?: "currency" | "percentage" | "integer" | "date" };

export type ExportSheet = {
  name: string;
  columns: Array<{
    header: string;
    width?: number;
    kind?: "currency" | "percentage" | "integer" | "date";
  }>;
  rows: ExportCell[][];
};

const share = (value: number, total: number) => (total ? value / total : null);
const comparison = (current: number, previous: number) =>
  percentChange(current, previous);

export function buildManagementReportExportSheets(
  report: ManagementReportData,
): ExportSheet[] {
  assertRefundBreakdownReconciles(
    report.refundBreakdown,
    report.payments.refunds,
  );
  const { current, previous } = report;
  const previousCakeQuantities = new Map(
    previous.cakes.map((cake) => [
      JSON.stringify([cake.cakeName, cake.sizeLabel]),
      cake.quantity,
    ]),
  );
  const revenue = [
    ["Gross Product Sales", current.grossProducts, "currency"],
    ["Discounts", current.discounts, "currency"],
    ["Net Product Sales", current.netProducts, "currency"],
    ["Delivery Charges", current.delivery, "currency"],
    ["Processing Fees", current.processing, "currency"],
    ["Other Adjustments", current.other, "currency"],
    ["Fulfilled Gross Sales", current.gross, "currency"],
    ["Fulfilled Net Sales", current.netSales, "currency"],
  ] as const;

  return [
    {
      name: "Summary",
      columns: [
        { header: "Group", width: 22 },
        { header: "Metric", width: 34 },
        { header: "Value", width: 20 },
        { header: "Notes", width: 58 },
      ],
      rows: [
        ["Report", "Reporting Month", current.month, "Scheduled fulfilment month"],
        ["Report", "Generated At", report.asOf, "Live information as recorded at generation time"],
        ["Report", "Live Report Disclaimer", "", "Later amendments, fulfilment, corrections or refunds may change a subsequently generated report."],
        ...revenue.map(([metric, value]) => [
          "Revenue",
          metric,
          { value, kind: "currency" },
          metric === "Other Adjustments" ? "Unclassified adjustments retained for reconciliation." : "",
        ] as ExportCell[]),
        ["Orders", "Fulfilled Orders", { value: current.fulfilled, kind: "integer" }, ""],
        ["Orders", "Average Order Value", { value: current.aov, kind: "currency" }, "Fulfilled net sales divided by fulfilled orders"],
        ["Orders", "Scheduled Orders", { value: current.scheduled, kind: "integer" }, ""],
        ["Orders", "Scheduled, Not Fulfilled", { value: current.unfulfilled, kind: "integer" }, `Current order value ${current.unfulfilledValue.toFixed(2)}; excluded from sales`],
        ["Orders", "Cancelled Orders", { value: current.cancelled, kind: "integer" }, `Current order value ${current.cancelledValue.toFixed(2)}; excluded from sales`],
        ["Payments", "Payments Collected", { value: report.payments.collected, kind: "currency" }, "By payment date; includes advance payments and corrected allocations"],
        ["Payments", "Recorded Refunds", { value: report.payments.refunds, kind: "currency" }, "Recorded refund amount by refund date"],
        ["Payments", "Net Receipts", { value: report.payments.netReceipts, kind: "currency" }, "Payments collected minus refunds issued in the selected month; by transaction date"],
        ["Payments", "Outstanding for Selected Month", { value: current.outstandingNow, kind: "currency" }, `Calculated as of ${report.asOf}; not a historical month-end balance`],
        ["Cake Sales", "Cake Quantity", { value: current.cakeQuantity, kind: "integer" }, "Historical order-item quantities"],
        ["Order Sources", "Fresh Pick Orders (subset)", { value: current.freshPicks.orders, kind: "integer" }, `Fresh Pick fulfilled sales ${current.freshPicks.netSales.toFixed(2)}; included in source totals and not additive`],
        ["Discounts", "Discounted Orders", { value: current.discountedOrders, kind: "integer" }, "Fulfilled orders with an effective discount"],
        ["Discounts", "Average Discount", { value: current.discountedOrders ? current.discounts / current.discountedOrders : 0, kind: "currency" }, "Total discounts divided by discounted fulfilled orders"],
        ["Discounts", "Discounts / Gross Sales", { value: share(current.discounts, current.gross), kind: "percentage" }, "No comparable percentage when gross sales are zero"],
      ],
    },
    {
      name: "Fulfilment",
      columns: [
        { header: "Method", width: 18 },
        { header: "Scheduled Orders", kind: "integer" },
        { header: "Fulfilled Orders", kind: "integer" },
        { header: "Unfulfilled Orders", kind: "integer" },
        { header: "Cancelled Orders", kind: "integer" },
        { header: "Gross Sales", kind: "currency" },
        { header: "Discounts", kind: "currency" },
        { header: "Net Sales", kind: "currency" },
        { header: "Share of Fulfilled Sales", kind: "percentage" },
        { header: "Average Order Value", kind: "currency" },
        { header: "Cake Units", kind: "integer" },
        { header: "Delivery Charges", kind: "currency" },
        { header: "Delivery Concessions", kind: "currency" },
      ],
      rows: current.methods.map((row) => [
        row.method,
        { value: row.scheduled, kind: "integer" },
        { value: row.fulfilled, kind: "integer" },
        { value: row.unfulfilled, kind: "integer" },
        { value: row.cancelled, kind: "integer" },
        { value: row.gross, kind: "currency" },
        { value: row.discounts, kind: "currency" },
        { value: row.netSales, kind: "currency" },
        { value: share(row.netSales, current.netSales), kind: "percentage" },
        { value: row.aov, kind: "currency" },
        { value: row.cakeQuantity, kind: "integer" },
        { value: row.deliveryCharges, kind: "currency" },
        { value: row.deliveryConcessions, kind: "currency" },
      ]),
    },
    {
      name: "Cake Sales",
      columns: [
        { header: "Cake Name", width: 42 },
        { header: "Cake Size", width: 16 },
        { header: "Quantity Sold", kind: "integer" },
        { header: "Gross Cake Revenue", kind: "currency" },
        { header: "Share of Cake Units", kind: "percentage" },
        { header: "Previous-Month Quantity", kind: "integer" },
        { header: "Quantity Change", kind: "integer" },
        { header: "Month-over-Month Change", kind: "percentage" },
      ],
      rows: current.cakes.map((cake) => {
        const previousQuantity = previousCakeQuantities.get(
          JSON.stringify([cake.cakeName, cake.sizeLabel]),
        ) ?? 0;
        return [
          cake.cakeName,
          cake.sizeLabel,
          { value: cake.quantity, kind: "integer" },
          { value: cake.revenue, kind: "currency" },
          { value: share(cake.quantity, current.cakeQuantity), kind: "percentage" },
          { value: previousQuantity, kind: "integer" },
          { value: cake.quantity - previousQuantity, kind: "integer" },
          { value: comparison(cake.quantity, previousQuantity), kind: "percentage" },
        ];
      }),
    },
    {
      name: "Discounts",
      columns: [
        { header: "Reason / Code", width: 42 },
        { header: "Discount Entries", kind: "integer" },
        { header: "Discount Value", kind: "currency" },
        { header: "Share of Gross Sales", kind: "percentage" },
      ],
      rows: [
        ...current.discountReasons.map((row) => [
          row.reason || "Unspecified",
          { value: row.count, kind: "integer" },
          { value: row.value, kind: "currency" },
          { value: share(row.value, current.gross), kind: "percentage" },
        ] as ExportCell[]),
        [
          "Total",
          { value: current.discountReasons.reduce((sum, row) => sum + row.count, 0), kind: "integer" },
          { value: current.discounts, kind: "currency" },
          { value: share(current.discounts, current.gross), kind: "percentage" },
        ] as ExportCell[],
      ],
    },
    {
      name: "Order Sources",
      columns: [
        { header: "Order Source", width: 30 },
        { header: "Orders", kind: "integer" },
        { header: "Fulfilled Orders", kind: "integer" },
        { header: "Fulfilled Net Sales", kind: "currency" },
        { header: "Share of Fulfilled Sales", kind: "percentage" },
      ],
      rows: current.sources.map((row) => [
          row.source,
          { value: row.orders, kind: "integer" },
          { value: row.fulfilled, kind: "integer" },
          { value: row.netSales, kind: "currency" },
          { value: share(row.netSales, current.netSales), kind: "percentage" },
        ]),
    },
    {
      name: "Bookings",
      columns: [
        { header: "Order Source", width: 30 },
        { header: "Orders Created", kind: "integer" },
        { header: "Overall Booking Value", kind: "currency" },
        { header: "Basis", width: 44 },
      ],
      rows: [
        ...report.bookings.sources.map((row): ExportCell[] => [
          row.source || "Unspecified",
          { value: row.count, kind: "integer" },
          null,
          "Per-source booking value is not exposed by V1.0; not recognised sales",
        ]),
        ["Total", { value: report.bookings.count, kind: "integer" }, { value: report.bookings.value, kind: "currency" }, "Current booking value; not recognised sales"] as ExportCell[],
      ],
    },
    {
      name: "Payments",
      columns: [
        { header: "Payment Method", width: 30 },
        { header: "Collected", kind: "currency" },
        { header: "Recorded Refunds", kind: "currency" },
        { header: "Net Receipts", kind: "currency" },
        { header: "Basis", width: 46 },
      ],
      rows: [
        ...report.payments.methods.map((row): ExportCell[] => [
          row.method ? paymentMethodDisplayLabel(row.method) : "Unspecified",
          { value: row.value, kind: "currency" },
          null,
          null,
          "Verified, corrected payment allocations by payment date; may include advance payments",
        ]),
        ["Total", { value: report.payments.collected, kind: "currency" }, { value: report.payments.refunds, kind: "currency" }, { value: report.payments.netReceipts, kind: "currency" }, "Net receipts = collections minus refunds in this report period"] as ExportCell[],
      ],
    },
    {
      name: "Refund Breakdown",
      columns: [
        { header: "Order Number", width: 24 },
        { header: "Refund Date", width: 16, kind: "date" },
        { header: "Refund Amount", width: 16, kind: "currency" },
        { header: "Refund Method", width: 24 },
        { header: "Refund Source / Type", width: 34 },
        { header: "Recorded By", width: 22 },
        { header: "Refund Reason", width: 56 },
      ],
      rows: report.refundBreakdown.map((row) => [
        row.orderNumber,
        { value: row.refundDate, kind: "date" },
        { value: row.amount, kind: "currency" },
        row.method,
        row.source,
        row.recordedBy,
        row.reason,
      ]),
    },
    {
      name: "Monthly Comparison",
      columns: [
        { header: "Metric", width: 30 },
        { header: "Selected Month", width: 20 },
        { header: "Previous Month", width: 20 },
        { header: "Change", width: 20 },
        { header: "Change %", kind: "percentage" },
      ],
      rows: [
        ["Fulfilled Net Sales", { value: current.netSales, kind: "currency" }, { value: previous.netSales, kind: "currency" }, { value: current.netSales - previous.netSales, kind: "currency" }, { value: comparison(current.netSales, previous.netSales), kind: "percentage" }],
        ["Fulfilled Order Count", { value: current.fulfilled, kind: "integer" }, { value: previous.fulfilled, kind: "integer" }, { value: current.fulfilled - previous.fulfilled, kind: "integer" }, { value: comparison(current.fulfilled, previous.fulfilled), kind: "percentage" }],
        ["Average Order Value", { value: current.aov, kind: "currency" }, { value: previous.aov, kind: "currency" }, { value: current.aov - previous.aov, kind: "currency" }, { value: comparison(current.aov, previous.aov), kind: "percentage" }],
        ["Discounts", { value: current.discounts, kind: "currency" }, { value: previous.discounts, kind: "currency" }, { value: current.discounts - previous.discounts, kind: "currency" }, { value: comparison(current.discounts, previous.discounts), kind: "percentage" }],
        ["Cake Quantity", { value: current.cakeQuantity, kind: "integer" }, { value: previous.cakeQuantity, kind: "integer" }, { value: current.cakeQuantity - previous.cakeQuantity, kind: "integer" }, { value: comparison(current.cakeQuantity, previous.cakeQuantity), kind: "percentage" }],
        ...current.methods.map((row) => {
          const priorValue = previous.methods.find((item) => item.method === row.method)?.netSales ?? 0;
          return [`${row.method} Sales`, { value: row.netSales, kind: "currency" }, { value: priorValue, kind: "currency" }, { value: row.netSales - priorValue, kind: "currency" }, { value: comparison(row.netSales, priorValue), kind: "percentage" }] as ExportCell[];
        }),
      ],
    },
  ];
}
