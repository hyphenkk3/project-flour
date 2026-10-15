import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync("src/workspaces/owner/orders/queries.ts", "utf8");
const sourceFile = ts.createSourceFile(
  "queries.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);

function loadFunction(name, context) {
  const declaration = sourceFile.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  assert.ok(declaration, `${name} must exist`);
  const compiled = ts.transpileModule(
    `export ${declaration.getText(sourceFile)}`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { ...context, exports });
  return exports[name];
}

const payment = {
  status: "verified",
  method: "wb_qr",
  method_description: null,
  paid_at: "2026-10-06",
  reference_note: null,
  verified_by: "staff-wee",
  verified_at: "2026-10-06T10:00:00Z",
  created_at: "2026-10-06T10:00:00Z",
};
const allocations = [
  {
    id: "allocation-1",
    payment_id: "payment-1",
    order_id: "order-1",
    amount: 125,
    created_at: "2026-10-06T10:00:00Z",
    payments: payment,
  },
  {
    id: "allocation-unverified",
    payment_id: "payment-unverified",
    order_id: "order-1",
    amount: 999,
    created_at: "2026-10-06T10:00:00Z",
    payments: { ...payment, status: "pending", verified_by: "staff-pending" },
  },
];
const refunds = [
  ["order_refund", "staff-wee", 20],
  ["order_refund", "staff-manager", 30],
  ["overpayment_correction", "staff-manager", 5],
  ["fresh_pick_cancellation", "staff-wee", 10],
  ["order_refund", "staff-missing", 1],
  ["order_refund", null, 1],
].map(([refund_type, created_by, amount], index) => ({
  id: `refund-${index}`,
  order_id: "order-1",
  payment_id: null,
  amount,
  reason: "Recorded refund",
  refund_type,
  refund_method: "cash",
  refund_method_description: null,
  refunded_at: "2026-10-15",
  status: "recorded",
  created_at: "2026-10-15T10:00:00Z",
  created_by,
}));
const corrections = [
  {
    id: "correction-1",
    payment_id: "payment-1",
    payment_allocation_id: "allocation-1",
    order_id: "order-1",
    correction_type: "amount",
    original_amount: 125,
    corrected_amount: 120,
    original_method: "wb_qr",
    corrected_method: "wb_qr",
    original_method_description: null,
    corrected_method_description: null,
    reason: "Keying error",
    corrected_by: "staff-manager",
    corrected_at: "2026-10-07T10:00:00Z",
  },
];

function result(value) {
  return {
    select(selection) {
      assert.doesNotMatch(selection, /staff_profiles!/);
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    in() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve({ data: value, error: null }).then(
        resolve,
        reject,
      );
    },
  };
}

for (const viewer of ["owner", "manager", "customer_operations"]) {
  let selectedFields = null;
  let selectedIds = null;
  const client = {
    from(table) {
      if (table === "payment_allocations") {
        return {
          ...result(allocations),
          select(selection) {
            assert.doesNotMatch(selection, /staff_profiles!/);
            return result(
              selection.trim() === "payment_id"
                ? allocations.map((row) => ({ payment_id: row.payment_id }))
                : allocations,
            );
          },
        };
      }
      return result(
        {
          order_adjustments: [],
          refunds,
          payment_corrections: corrections,
        }[table],
      );
    },
  };
  const admin = {
    from(table) {
      assert.equal(table, "staff_profiles");
      return {
        select(fields) {
          selectedFields = fields;
          return {
            in(column, ids) {
              assert.equal(column, "id");
              selectedIds = [...ids];
              return result([
                { id: "staff-wee", display_name: "wee" },
                { id: "staff-manager", display_name: "Manager name" },
              ]);
            },
          };
        },
      };
    },
  };
  const loadOrderFinancials = loadFunction("loadOrderFinancials", {
    createClient: async () => client,
    createServiceClient: () => admin,
    relationOne: (value) =>
      Array.isArray(value) ? (value[0] ?? null) : (value ?? null),
    Map,
    Set,
    Array,
    Number,
    String,
  });
  const financial = await loadOrderFinancials("order-1");
  assert.equal(selectedFields, "id, display_name", viewer);
  assert.deepEqual(selectedIds.sort(), [
    "staff-manager",
    "staff-missing",
    "staff-wee",
  ]);
  assert.equal(financial.paymentAllocations.length, 1, viewer);
  assert.equal(financial.paymentAllocations[0].verifiedByName, "wee", viewer);
  assert.equal(financial.paymentAllocations[0].amount, 125, viewer);
  assert.equal(
    financial.paymentAllocations[0].correction.correctedByName,
    "Manager name",
    viewer,
  );
  assert.equal(financial.paymentAllocations[0].effectiveAmount, 120, viewer);
  assert.deepEqual(
    Array.from(financial.refunds, (row) => row.createdByName),
    ["wee", "Manager name", "Manager name", "wee", null, null],
    viewer,
  );
  assert.deepEqual(
    Array.from(financial.refunds, (row) => row.refundType),
    [
      "order_refund",
      "order_refund",
      "overpayment_correction",
      "fresh_pick_cancellation",
      "order_refund",
      "order_refund",
    ],
    viewer,
  );
  if (viewer === "manager") {
    const unavailableLookup = loadFunction("loadOrderFinancials", {
      createClient: async () => client,
      createServiceClient: () => {
        throw new Error("Temporary lookup failure");
      },
      relationOne: (value) =>
        Array.isArray(value) ? (value[0] ?? null) : (value ?? null),
      Map,
      Set,
      Array,
      Number,
      String,
    });
    const unavailable = await unavailableLookup("order-1");
    assert.equal(
      unavailable.paymentAllocations[0].verifiedByName,
      "Name unavailable",
    );
    assert.equal(unavailable.refunds[0].createdByName, "Name unavailable");
    assert.equal(unavailable.refunds.at(-1).createdByName, null);
  }
}

let privilegedLookupCalled = false;
const getGuestOrderById = loadFunction("getGuestOrderById", {
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  }),
  createServiceClient: () => {
    privilegedLookupCalled = true;
  },
  orderSelect: "id",
});
assert.equal(await getGuestOrderById("inaccessible-order"), null);
assert.equal(privilegedLookupCalled, false);

const paymentUi = readFileSync(
  "src/workspaces/owner/orders/PaymentSection.tsx",
  "utf8",
);
assert.match(paymentUi, /row\.createdByName \?\? "Staff"/);
assert.match(paymentUi, /row\.verifiedByName \?\? "Staff"/);
assert.match(paymentUi, /row\.correction\.correctedByName \?\? "Staff"/);
console.log(
  "PASS financial actor names are viewer-independent and lookup is scoped",
);
