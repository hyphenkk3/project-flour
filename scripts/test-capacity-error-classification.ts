import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyCapacityLookupError,
  getConfirmedZeroCapacityDates,
  isExpectedAdvisoryPermissionDenial,
  isMissingRelation,
  isMissingWaitingListColumn,
} from "../src/workspaces/storefront/checkout/capacity-errors.ts";

const missingCapacity = {
  code: "42P01",
  message: 'relation "public.production_capacity" does not exist',
};
assert.equal(isMissingRelation(missingCapacity, "production_capacity"), true);
assert.equal(
  isMissingRelation(
    {
      code: "PGRST205",
      message:
        "Could not find the table 'public.production_capacity' in the schema cache",
    },
    "production_capacity",
  ),
  true,
);
assert.equal(
  isMissingRelation(
    { code: "42P01", message: 'relation "public.orders" does not exist' },
    "production_capacity",
  ),
  false,
);

const permissionDenied = {
  code: "42501",
  message: 'permission denied for table "production_capacity"',
};
assert.equal(isMissingRelation(permissionDenied, "production_capacity"), false);
assert.equal(
  classifyCapacityLookupError(permissionDenied, "production_capacity"),
  "unconfirmed",
);
assert.equal(
  isExpectedAdvisoryPermissionDenial(permissionDenied, "production_capacity"),
  true,
  "the intentional anonymous table denial is identified only for the advisory relation",
);
assert.equal(
  isExpectedAdvisoryPermissionDenial(permissionDenied, "orders"),
  false,
  "permission denials on other relations remain visible failures",
);
assert.equal(
  isExpectedAdvisoryPermissionDenial(
    { code: "57014", message: "canceling statement due to statement timeout" },
    "production_capacity",
  ),
  false,
  "timeouts remain surfaced as advisory failures",
);
assert.equal(
  classifyCapacityLookupError(missingCapacity, "production_capacity"),
  "missing_relation",
);
assert.equal(
  isMissingRelation(
    { code: "57014", message: "canceling statement due to statement timeout" },
    "production_capacity",
  ),
  false,
);
assert.equal(
  classifyCapacityLookupError(
    { code: "57014", message: "canceling statement due to statement timeout" },
    "production_capacity",
  ),
  "unconfirmed",
);
assert.deepEqual(
  getConfirmedZeroCapacityDates({
    rows: [
      {
        pickupDate: "2026-11-10",
        cakeId: "cake-1",
        sizeId: null,
        collectionId: null,
        capacityQuantity: 0,
        waitingListEnabled: false,
      },
      {
        pickupDate: "2026-11-10",
        cakeId: "cake-1",
        sizeId: "size-1",
        collectionId: "collection-1",
        capacityQuantity: 1,
        waitingListEnabled: false,
      },
      {
        pickupDate: "2026-11-11",
        cakeId: "cake-1",
        sizeId: "size-1",
        collectionId: "collection-1",
        capacityQuantity: 0,
        waitingListEnabled: false,
      },
    ],
    cart: [{ cakeId: "cake-1", cakeSizeId: "size-1" }],
    collectionId: "collection-1",
  }),
  ["2026-11-11"],
  "an unconfirmed snapshot keeps only a matching zero-capacity date; a more specific non-full row wins",
);
assert.equal(
  isMissingRelation(
    { code: "08006", message: "connection failed" },
    "production_capacity",
  ),
  false,
);

assert.equal(
  isMissingWaitingListColumn({
    code: "42703",
    message: 'column "waiting_list_enabled" does not exist',
  }),
  true,
);
assert.equal(
  isMissingWaitingListColumn({
    code: "PGRST204",
    message:
      "Could not find the 'waiting_list_enabled' column in the schema cache",
  }),
  true,
);
assert.equal(isMissingWaitingListColumn(permissionDenied), false);

const actionSource = readFileSync(
  resolve("src/workspaces/storefront/checkout/actions.ts"),
  "utf8",
);
assert.match(actionSource, /ok:\s*true/);
assert.match(actionSource, /ok:\s*false/);
assert.doesNotMatch(
  actionSource,
  /catch\s*\{\s*return\s*\{\s*fullyBookedDates/,
);

const formSource = readFileSync(
  resolve("src/workspaces/storefront/checkout/GuestCheckoutForm.tsx"),
  "utf8",
);
assert.match(
  formSource,
  /We can’t confirm capacity for every date right now/,
);
assert.match(formSource, /cartCapacityStatus === "loading"/);
assert.match(formSource, /cartCapacityStatus === "unconfirmed"/);
assert.match(
  formSource,
  /cartCapacityStatus === "unconfirmed" &&\s*cartCapacity\.showAdvisoryFailureNotice/,
  "only surfaced advisory failures render the notice; expected permission denial stays unconfirmed without a persistent warning",
);
assert.match(formSource, /availability will be checked securely when you submit/);
assert.match(actionSource, /availabilityConfirmed/);
assert.doesNotMatch(actionSource, /return \{ ok: false \};/);
assert.match(actionSource, /submit_guest_preorder/);
assert.match(
  formSource,
  /const submitBlocked =[^;]*cartCapacityStatus === "loading"/s,
);
assert.doesNotMatch(
  formSource.match(/const submitBlocked =([\s\S]*?);/)?.[1] ?? "",
  /unconfirmed/,
);
assert.match(
  formSource,
  /items\.length === 0 \|\| cartCapacityStatus === "loading"[\s\S]*?\? emptyCapacity\s*:\s*cartCapacity/,
  "known-full dates retained from an unconfirmed snapshot remain blocked",
);

console.log(
  "PASS capacity error classification, advisory warning and known-full preservation",
);
