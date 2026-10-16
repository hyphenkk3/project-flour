import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { inflateRawSync, inflateSync } from "node:zlib";

const nativeRequire = createRequire(import.meta.url);
const cache = new Map();

function loadTs(name) {
  if (!name.startsWith("@/")) return nativeRequire(name);
  if (cache.has(name)) return cache.get(name);
  const stem = path.join(process.cwd(), "src", name.slice(2));
  const file = [stem + ".ts", stem + ".tsx", path.join(stem, "index.ts")].find(existsSync);
  assert.ok(file, `missing module ${name}`);
  const ts = nativeRequire("typescript");
  const exports = {};
  cache.set(name, exports);
  const javascript = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const localRequire = (dependency) => {
    if (dependency === "server-only") return {};
    return dependency.startsWith("@/") ? loadTs(dependency) : nativeRequire(dependency);
  };
  vm.runInNewContext(javascript, {
    exports,
    require: localRequire,
    Buffer,
    Date,
    Intl,
    Map,
    Set,
    Number,
    String,
    Math,
    Array,
    JSON,
    Object,
    RegExp,
  }, { filename: file });
  return exports;
}

const {
  buildMonthlyReport,
  percentChange,
} = loadTs("@/engines/reports/monthly");
const { buildManagementReportExportSheets } = loadTs("@/engines/reports/export-data");
const { generateManagementReportPdf } = loadTs("@/workspaces/owner/reports/export/pdf");
const { generateManagementReportXlsx } = loadTs("@/workspaces/owner/reports/export/xlsx");

const item = (cakeName, sizeLabel, quantity, unitPrice) => ({ cakeName, sizeLabel, quantity, unitPrice });
const adjustment = (amount, kind, code, status = "active", reversesAdjustmentId = null) => ({
  amount,
  kind,
  code,
  label: code ?? "Adjustment",
  reason: null,
  status,
  reversesAdjustmentId,
});
const order = (id, method, overrides = {}) => ({
  id,
  pickupDate: "2026-10-05",
  createdAt: "2026-09-28T10:00:00Z",
  method,
  status: "paid",
  source: "customer_website",
  extraStockId: null,
  deliveryConcession: 0,
  pickedUpAt: method === "delivery" ? null : "2026-10-06T01:00:00Z",
  deliveredAt: method === "delivery" ? "2026-11-01T01:00:00Z" : null,
  items: [item("Mango <Classic> & Friends " + "Long Name ".repeat(8), '6"', 2, 50)],
  addons: [{ quantity: 1, unitPrice: 3 }],
  adjustments: [],
  allocations: [],
  refunds: [],
  ...overrides,
});

const currentOrders = [
  order("pickup-1", "pickup", {
    items: [
      item("=HYPERLINK(\"https://example.invalid\")", '6"', 2, 50),
      item("Mango <Classic> & Friends " + "Long Name ".repeat(8), '8"', 1, 80),
    ],
    adjustments: [
      adjustment(-10, "promotion", "promo-october"),
      adjustment(10, "reversal", "promo-october", "active", "old"),
      adjustment(4, "fee", "delivery_fee"),
      adjustment(2, "fee", "delivery_processing_fee"),
      adjustment(-3, "manual"),
    ],
    allocations: [{ amount: 143, effectiveAmount: 140, status: "verified", method: "wb_qr", paidAt: "2026-10-01" }],
    refunds: [{ amount: 5, status: "recorded", refundedAt: "2026-10-10" }],
  }),
  order("delivery-1", "delivery", {
    items: [item("Mango", '6"', 1, 50)],
    addons: [],
    extraStockId: "fresh-pick-stock",
  }),
  order("dine-1", "dine_in", {
    items: [item("Pistachio", '8"', 1, 80)],
    addons: [],
  }),
  order("pending-1", "pickup", { status: "paid", pickedUpAt: null }),
  order("cancelled-1", "pickup", { status: "cancelled" }),
];
const previousOrder = order("prior", "pickup", {
  pickupDate: "2026-09-30",
  items: [item("Mango", '6"', 1, 45)],
  addons: [],
});
const current = buildMonthlyReport(currentOrders, "2026-10");
const previous = buildMonthlyReport([previousOrder], "2026-09");
const report = {
  current,
  previous,
  bookings: {
    count: 4,
    value: 270,
    sources: [
      { source: "customer_website", count: 3 },
      { source: "walk_in", count: 1 },
    ],
  },
  payments: {
    collected: 140,
    refunds: 5,
    methods: [
      { method: "wb_qr", value: 110 },
      { method: "online_transfer", value: 30 },
    ],
  },
  refundBreakdown: [
    {
      orderNumber: "ORD-20261006-0002",
      refundDate: "2026-10-15",
      amount: 2,
      method: "Online Transfer",
      source: "General Refund",
      recordedBy: "wee",
      reason: "Long reason " + "detail ".repeat(80),
    },
    {
      orderNumber: "ORD-20261006-0002",
      refundDate: "2026-10-15",
      amount: 3,
      method: "Not recorded",
      source: "Fresh Pick Cancellation Refund",
      recordedBy: "Staff",
      reason: "Legacy record",
    },
  ],
  asOf: "2026-10-13T10:00:00.000Z",
};

assert.equal(current.month, "2026-10", "selected month is retained");
assert.equal(current.fulfilled, 3);
assert.equal(current.cakeQuantity, 5);
assert.equal(current.methods.length, 3);
assert.equal(current.freshPicks.orders, 1);
assert.equal(percentChange(10, 0), null, "zero comparison has no misleading percent");

const sheets = buildManagementReportExportSheets(report);
assert.deepEqual(Array.from(sheets, (sheet) => sheet.name), [
  "Summary", "Fulfilment", "Cake Sales", "Discounts", "Order Sources", "Bookings", "Payments", "Refund Breakdown", "Monthly Comparison",
]);
const summary = sheets.find((sheet) => sheet.name === "Summary");
const summaryNet = summary.rows.find((row) => row[1] === "Fulfilled Net Sales")[2];
assert.equal(summaryNet.value, current.netSales, "summary uses the dashboard's fulfilled net sales");
assert.equal(summary.rows.find((row) => row[1] === "Discounts")[2].value, current.discounts);
assert.equal(summary.rows.find((row) => row[1] === "Fresh Pick Orders (subset)")[2].value, current.freshPicks.orders);
const cakeSheet = sheets.find((sheet) => sheet.name === "Cake Sales");
assert.ok(cakeSheet.rows.some((row) => row[1] === '8"'), "multiple historical sizes are included");
assert.ok(cakeSheet.rows.some((row) => row[0].startsWith("Mango <Classic> & Friends")), "long historical cake name is preserved");
const refundSheet = sheets.find((sheet) => sheet.name === "Refund Breakdown");
assert.equal(refundSheet.rows[0][0], "ORD-20261006-0002");
assert.equal(refundSheet.rows[0][1].value, "2026-10-15");
assert.equal(refundSheet.rows[0][2].value, 2);
assert.equal(refundSheet.rows[1][2].value, 3);
assert.equal(refundSheet.rows.reduce((total, row) => total + row[2].value, 0), report.payments.refunds, "refund rows reconcile exactly with recorded refunds");
assert.equal(refundSheet.rows[1][3], "Not recorded", "legacy refund methods are not invented");
const paymentsSheet = sheets.find((sheet) => sheet.name === "Payments");
assert.ok(paymentsSheet.rows.some((row) => row[0] === "Online Transfer"), "Excel payment methods use the shared display label");

const xlsx = generateManagementReportXlsx(report);
assert.equal(xlsx.readUInt32LE(0), 0x04034b50, "XLSX starts with a ZIP local header");
assert.equal(xlsx.readUInt32LE(xlsx.length - 22), 0x06054b50, "XLSX has a ZIP central directory terminator");
const zipEntries = new Map();
let offset = 0;
while (xlsx.readUInt32LE(offset) === 0x04034b50) {
  const method = xlsx.readUInt16LE(offset + 8);
  const compressedSize = xlsx.readUInt32LE(offset + 18);
  const nameLength = xlsx.readUInt16LE(offset + 26);
  const extraLength = xlsx.readUInt16LE(offset + 28);
  const nameStart = offset + 30;
  const name = xlsx.toString("utf8", nameStart, nameStart + nameLength);
  const bodyStart = nameStart + nameLength + extraLength;
  const compressed = xlsx.subarray(bodyStart, bodyStart + compressedSize);
  assert.equal(method, 8, "workbook files are valid deflated ZIP entries");
  zipEntries.set(name, inflateRawSync(compressed).toString("utf8"));
  offset = bodyStart + compressedSize;
}
assert.ok(zipEntries.has("[Content_Types].xml"));
const workbook = zipEntries.get("xl/workbook.xml");
for (const name of ["Summary", "Fulfilment", "Cake Sales", "Discounts", "Order Sources", "Bookings", "Payments", "Refund Breakdown", "Monthly Comparison"])
  assert.ok(workbook.includes(`name=\"${name}\"`), `workbook contains ${name} sheet`);
const summaryXml = zipEntries.get("xl/worksheets/sheet1.xml");
assert.match(summaryXml, /t="n"/, "financial values are numeric worksheet cells");
assert.match(summaryXml, /s="2" t="n"/, "currency values carry a currency number format");
const cakeXml = zipEntries.get("xl/worksheets/sheet3.xml");
assert.match(cakeXml, /t="inlineStr"/, "untrusted fields are written as literal strings");
assert.doesNotMatch(cakeXml, /<f(?:\s|>)/, "no user text is emitted as a spreadsheet formula");
assert.ok(cakeXml.includes("=HYPERLINK(&quot;https://example.invalid&quot;)") || cakeXml.includes("=HYPERLINK(&quot;https://example.invalid&quot;") , "formula-like cake text remains XML-escaped literal text");
assert.match(zipEntries.get("xl/styles.xml"), /RM/);
const refundXml = zipEntries.get("xl/worksheets/sheet8.xml");
assert.match(refundXml, /<c r="B2" s="5" t="n"><v>46310<\/v><\/c>/, "refund date is stored as an Excel date serial");
assert.match(refundXml, /<c r="C2" s="2" t="n"><v>2<\/v><\/c>/, "refund amount is numeric with currency formatting");

const pdf = await generateManagementReportPdf(report);
assert.match(pdf.subarray(0, 8).toString("ascii"), /^%PDF-1\./, "PDF has a PDF header");
assert.ok(pdf.includes(Buffer.from("%%EOF")), "PDF has a complete trailer");
if (process.env.REPORT_EXPORT_OUT) {
  const outputDirectory = path.resolve(process.env.REPORT_EXPORT_OUT);
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(outputDirectory, "Whitebird_Report_2026-10.pdf"), pdf, { mode: 0o600 });
  writeFileSync(path.join(outputDirectory, "Whitebird_Report_2026-10.xlsx"), xlsx, { mode: 0o600 });
}
const temp = mkdtempSync(path.join(os.tmpdir(), "project-flour-export-test-"));
try {
  const file = path.join(temp, "report.pdf");
  writeFileSync(file, pdf, { mode: 0o600 });
  const checked = spawnSync("pdfinfo", [file], { encoding: "utf8" });
  assert.equal(checked.status, 0, `PDF parser accepts generated file: ${checked.stderr}`);
  const pageCount = Number(checked.stdout.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
  assert.ok(pageCount >= 2, "long cake tables paginate across A4 pages");
  const decodedStreams = [];
  let cursor = 0;
  while ((cursor = pdf.indexOf(Buffer.from("stream\n"), cursor)) >= 0) {
    const start = cursor + Buffer.byteLength("stream\n");
    const end = pdf.indexOf(Buffer.from("endstream"), start);
    if (end < 0) break;
    try {
      decodedStreams.push(inflateSync(pdf.subarray(start, end)).toString("latin1"));
    } catch {
      // Non-text or uncompressed streams are irrelevant to text assertions.
    }
    cursor = end + Buffer.byteLength("endstream");
  }
  const pdfText = decodedStreams.join("\n").replace(
    /\[([^\]]*)\]\s*TJ/g,
    (_match, content) => content
      .replace(/<([0-9a-f]+)>/gi, (_hexMatch, hex) => Buffer.from(hex, "hex").toString("latin1"))
      .replace(/\s*-?\d+(?:\.\d+)?\s*/g, "") + " ",
  );
  assert.match(pdfText, /Refund Breakdown/, "PDF includes the refund breakdown section");
  assert.match(pdfText, /detail.*detail/, "long refund reason remains in the paginated PDF");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const empty = {
  current: buildMonthlyReport([], "2026-02"),
  previous: buildMonthlyReport([], "2026-01"),
  bookings: { count: 0, value: 0, sources: [] },
  payments: { collected: 0, refunds: 0, methods: [] },
  refundBreakdown: [],
  asOf: "2026-03-01T00:00:00.000Z",
};
const emptySheets = buildManagementReportExportSheets(empty);
assert.equal(emptySheets.find((sheet) => sheet.name === "Summary").rows.find((row) => row[1] === "Fulfilled Net Sales")[2].value, 0);
assert.ok(generateManagementReportXlsx(empty).length > 1000, "empty month workbook is valid and includes zero metrics");
assert.ok((await generateManagementReportPdf(empty)).includes(Buffer.from("%%EOF")), "empty month PDF is valid");

const route = readFileSync("src/workspaces/owner/reports/export/route-response.ts", "utf8");
const controls = readFileSync("src/workspaces/owner/reports/ReportExportControls.tsx", "utf8");
assert.match(route, /getSessionStaff\(\)/);
assert.match(route, /if \(!staff\)[\s\S]*status: 401/);
assert.match(route, /if \(!isReportOwner\(staff\.role\.code\)\)[\s\S]*status: 403/);
assert.match(route, /loadManagementReport\(month\)/);
assert.match(route, /Cache-Control[\s\S]*private, no-store/);
assert.match(route, /Whitebird_Report_\$\{month\}/);
assert.match(controls, /Export PDF/);
assert.match(controls, /Export Excel/);
assert.match(controls, /disabled=\{loading !== null\}/);
assert.match(controls, /role="alert"/);
assert.match(controls, /Whitebird_Report_\$\{month\}/);

let sessionStaff = null;
const loadedMonths = [];
const routeModule = { exports: {} };
const routeJs = nativeRequire("typescript").transpileModule(route, {
  compilerOptions: {
    module: nativeRequire("typescript").ModuleKind.CommonJS,
    target: nativeRequire("typescript").ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;
const routeRequire = (dependency) => {
  if (dependency === "server-only") return {};
  if (dependency === "@/foundation/auth/session")
    return { getSessionStaff: async () => sessionStaff };
  if (dependency === "@/engines/reports/monthly")
    return {
      isReportOwner: (role) => role === "owner",
      nextMonth: (month) => {
        const [year, number] = month.split("-").map(Number);
        return number === 12
          ? `${year + 1}-01`
          : `${year}-${String(number + 1).padStart(2, "0")}`;
      },
      reportMonth: () => "2026-10",
    };
  if (dependency === "@/workspaces/owner/reports/queries")
    return {
      loadManagementReport: async (month) => {
        loadedMonths.push(month);
        return report;
      },
    };
  if (dependency.endsWith("/pdf"))
    return { generateManagementReportPdf: async () => Buffer.from("pdf") };
  if (dependency.endsWith("/xlsx"))
    return { generateManagementReportXlsx: () => Buffer.from("xlsx") };
  throw new Error(`Unexpected route dependency: ${dependency}`);
};
vm.runInNewContext(routeJs, {
  exports: routeModule.exports,
  require: routeRequire,
  Buffer,
  Date,
  URL,
  Response,
  Uint8Array,
}, { filename: "route-response.ts" });
const { handleManagementReportExport } = routeModule.exports;
const exportRequest = (month) => new Request(
  `https://whitebird.asia/api/owner/management/reports/export/pdf?month=${encodeURIComponent(month)}`,
);
sessionStaff = null;
assert.equal((await handleManagementReportExport(exportRequest("2026-09"), "pdf")).status, 401,
  "unauthenticated exports are denied");
sessionStaff = { role: { code: "manager" } };
assert.equal((await handleManagementReportExport(exportRequest("2026-09"), "pdf")).status, 403,
  "Manager exports are denied");
sessionStaff = { role: { code: "owner" } };
const ownerResponse = await handleManagementReportExport(exportRequest("2026-09"), "pdf");
assert.equal(ownerResponse.status, 200, "Owner export succeeds");
assert.equal(ownerResponse.headers.get("content-type"), "application/pdf");
assert.match(ownerResponse.headers.get("content-disposition"), /Whitebird_Report_2026-09\.pdf/);
assert.equal(ownerResponse.headers.get("cache-control"), "private, no-store, max-age=0");
assert.equal(loadedMonths.at(-1), "2026-09", "selected month is passed to the existing report loader");
assert.equal((await handleManagementReportExport(exportRequest("2026-11"), "xlsx")).status, 400,
  "future month exports are rejected");

console.log("Management report PDF/XLSX generation, workbook structure, numeric/currency cells, formula safety, dashboard parity, empty months, PDF validity, and Owner route protections passed.");
