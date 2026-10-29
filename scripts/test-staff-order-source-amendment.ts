import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  JOTFORM_NEW_ORDER_CUTOFF_MS,
  isJotformAvailableForNewStaffOrder,
  normalizeNewStaffOrderSourceInput,
} from "../src/engines/orders/staff-order-source";
import {
  STAFF_GUEST_ORDER_SOURCES,
  defaultStaffGuestNewOrderSource,
  orderSourceLabelWithDetail,
  staffGuestNewOrderSources,
} from "../src/workspaces/owner/orders/labels";
import { reportOrderSourceLabel } from "../src/engines/reports/monthly";

const source = (path: string) => readFileSync(resolve(path), "utf8");
const cutoff = JOTFORM_NEW_ORDER_CUTOFF_MS;

assert.equal(cutoff, Date.parse("2026-10-31T16:00:00.000Z"));
assert.equal(
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(cutoff)),
  "01/11/2026, 00:00",
);
assert.equal(isJotformAvailableForNewStaffOrder(cutoff - 1), true);
assert.equal(isJotformAvailableForNewStaffOrder(cutoff), false);
assert.equal(isJotformAvailableForNewStaffOrder(cutoff + 1), false);
assert.equal(defaultStaffGuestNewOrderSource(), "whatsapp");
assert(staffGuestNewOrderSources(cutoff - 1).some((item) => item.value === "jotform"));
assert(!staffGuestNewOrderSources(cutoff).some((item) => item.value === "jotform"));
assert(STAFF_GUEST_ORDER_SOURCES.some((item) => item.value === "jotform"));

for (const option of [
  "whatsapp",
  "whitebird_instagram",
  "wee",
  "lex",
  "kin",
  "other",
]) {
  assert(STAFF_GUEST_ORDER_SOURCES.some((item) => item.value === option));
}
assert.deepEqual(normalizeNewStaffOrderSourceInput("kin", "", cutoff), {
  orderSource: "kin",
  orderSourceOther: null,
});
assert.deepEqual(
  normalizeNewStaffOrderSourceInput("other", "  Friend referral  ", cutoff),
  { orderSource: "other", orderSourceOther: "Friend referral" },
);
assert("error" in normalizeNewStaffOrderSourceInput("other", "   ", cutoff));
assert("error" in normalizeNewStaffOrderSourceInput("jotform", "", cutoff));
assert(
  "error" in
    normalizeNewStaffOrderSourceInput("whatsapp", "unexpected detail", cutoff - 1),
);
assert.equal(
  orderSourceLabelWithDetail("other", "  Friend referral "),
  "Other — Friend referral",
);
assert.equal(reportOrderSourceLabel("other", "  Friend referral "), "Other — Friend referral");
assert.equal(orderSourceLabelWithDetail("jotform", null), "Jotform");

const ownerForm = source("src/workspaces/owner/orders/StaffGuestOrderForm.tsx");
const assistedForm = source("src/workspaces/customer-operations/orders/AssistedOrderForm.tsx");
const sourceFields = source("src/workspaces/owner/orders/StaffGuestOrderSourceFields.tsx");
const serverCreate = source("src/workspaces/owner/orders/create-staff-preorder.ts");
const ownerActions = source("src/workspaces/owner/orders/actions.ts");
const customerOpsActions = source("src/workspaces/customer-operations/orders/actions.ts");
const duplicateActions = source("src/workspaces/owner/orders/actions.ts");
const duplicateUi = source("src/workspaces/owner/orders/OrderLifecycleActions.tsx");
const migration = source("supabase/migrations/20261029101735_staff_order_source_amendment.sql");
const ownerQueries = source("src/workspaces/owner/orders/queries.ts");
const reports = source("src/workspaces/owner/reports/queries.ts");

assert(ownerForm.includes("<StaffGuestOrderSourceFields />"));
assert(assistedForm.includes("<StaffGuestOrderSourceFields />"));
assert(sourceFields.includes('label="Specify order source"'));
assert(sourceFields.includes('name="order_source_other"'));
assert(sourceFields.includes("required"));
assert(serverCreate.includes("normalizeNewStaffOrderSourceInput"));
assert(serverCreate.includes('"create_staff_guest_preorder_with_source_detail"'));
assert(customerOpsActions.includes("orderSourceOther"));
assert(ownerActions.includes("orderSourceOther"));
assert(ownerActions.includes('"create_staff_guest_preorder_with_source_detail"'));
assert(duplicateActions.includes("normalizeNewStaffOrderSourceInput"));
assert(duplicateActions.includes('"create_staff_guest_preorder_with_source_detail"'));
assert(duplicateUi.includes('label="Specify order source"'));
assert(duplicateUi.includes('formData.set("order_source_other", duplicateSourceOther)'));
assert(ownerQueries.includes("orderSourceOther: order.orderSourceOther ?? null"));
assert(reports.includes("order_source_other"));
assert(migration.includes("add column order_source_other text"));
assert(migration.includes("'kin'"));
assert(migration.includes("transaction_timestamp() >= timestamptz '2026-10-31 16:00:00+00'"));
assert(migration.includes("if v_source = 'other' and v_source_other is null"));
assert(migration.includes("v_source := nullif(trim(coalesce(p_order_source, '')), '')"));
assert(migration.includes("public.create_staff_guest_preorder_with_source_detail"));
assert(migration.includes("p_order_source_other text"));
assert(migration.includes("create_waiting_list_preorder_with_source_detail"));
assert(migration.includes("p_internal_notes, null,"));
assert(!migration.includes("app.staff_order_source_other"));
assert(!migration.includes("current_setting("));
assert(!migration.includes("set_config("));
assert(!/create\s+or\s+replace\s+function\s+public\.create_staff_guest_preorder\s*\(/i.test(migration));
assert(!/\b(update|delete)\s+public\.orders\b/i.test(migration));

console.log("PASS staff order source amendment focused regression");
