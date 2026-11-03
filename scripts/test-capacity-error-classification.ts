import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
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
  isMissingRelation(
    { code: "57014", message: "canceling statement due to statement timeout" },
    "production_capacity",
  ),
  false,
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
  /We couldn’t confirm availability for your selected dates/,
);
assert.match(formSource, /cartCapacityStatus !== "ready"/);
assert.match(formSource, /availability for your selected dates/);

console.log(
  "PASS capacity error classification and customer fail-closed handling",
);
