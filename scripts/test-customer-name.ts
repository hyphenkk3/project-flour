/**
 * Guest checkout display-name rules.
 * Run: npx tsx scripts/test-customer-name.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CUSTOMER_NAME_SURNAME_ERROR,
  CUSTOMER_NAME_TITLE_ERROR,
  customerNameValidationError,
} from "@/engines/orders/customer-name";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

assert.equal(customerNameValidationError("Lim"), CUSTOMER_NAME_SURNAME_ERROR);
assert.equal(customerNameValidationError("Mr Lim"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("Mdm Lim"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("Mr John Lim"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("Mrs Lim"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("Ms Lim"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("Miss Lim"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("Madam Lim"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("Dr Tan"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("Prof Tan Wei"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("Professor Tan"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("Sir John Tan"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("Datuk Lim"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("Dato Lim"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("Dato' Lim"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("Datin Lim"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("mr. lim"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("MDM LIM"), CUSTOMER_NAME_TITLE_ERROR);
assert.equal(customerNameValidationError("JOHN LIM"), null);
assert.equal(customerNameValidationError("John Lim"), null);
assert.equal(customerNameValidationError("John Tan"), null);
assert.equal(customerNameValidationError("Tan Wei Ming"), null);
assert.equal(customerNameValidationError("Siti Nur"), null);
assert.equal(customerNameValidationError(""), null);

const formSrc = readSrc("src/workspaces/storefront/checkout/GuestCheckoutForm.tsx");
const handleSubmitSrc = formSrc.slice(
  formSrc.indexOf("function handleSubmit"),
  formSrc.indexOf("function confirmOrder"),
);
assert.match(handleSubmitSrc, /customerNameValidationError/);
assert.match(handleSubmitSrc, /setNameError\(nameErrorMessage\)/);
assert.match(handleSubmitSrc, /setConfirmOpen\(true\)/);
assert.doesNotMatch(handleSubmitSrc, /formAction\(/);
assert.match(formSrc, /WAITING_LIST_NAME_HELP/);
assert.match(formSrc, /setNameError\(null\)/);

const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
assert.match(actionsSrc, /customerNameValidationError/);
assert.match(actionsSrc, /return \{ error: nameError \}/);

console.log("PASS customer checkout name validation");
