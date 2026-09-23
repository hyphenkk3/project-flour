/**
 * Library Customer Q&A management.
 * Run: npx tsx scripts/test-library-customer-qa.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canManageLibrary, canViewLibrary } from "@/foundation/navigation/access";
import {
  FAQ_ANSWER_REQUIRED,
  FAQ_QUESTION_REQUIRED,
  activeFaqItems,
  moveFaqItemInOrder,
  nextFaqDisplayOrder,
  normalizeFaqAnswer,
  normalizeFaqQuestion,
} from "@/engines/storefront/faq";
import { STOREFRONT_FAQ_ITEMS } from "@/workspaces/storefront/home/storefront-contact";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

assert.equal(canManageLibrary("owner"), true);
assert.equal(canManageLibrary("manager"), true);
assert.equal(canManageLibrary("bakery"), false);
assert.equal(canManageLibrary("customer_operations"), false);
assert.equal(canViewLibrary("bakery"), true);

assert.equal(normalizeFaqQuestion("  Hello   world  "), "Hello world");
assert.equal(normalizeFaqQuestion("   "), null);
assert.equal(
  normalizeFaqAnswer("  Line one\n\nLine two  "),
  "Line one\n\nLine two",
);
assert.equal(normalizeFaqAnswer("   \n  "), null);
assert.equal(FAQ_QUESTION_REQUIRED, "Enter a question.");
assert.equal(FAQ_ANSWER_REQUIRED, "Enter an answer.");

const rows = [
  { id: "a", question: "A", displayOrder: 1 },
  { id: "b", question: "B", displayOrder: 2 },
  { id: "c", question: "C", displayOrder: 3 },
];
assert.deepEqual(
  moveFaqItemInOrder(rows, "b", -1).map((row) => row.id),
  ["b", "a", "c"],
);
assert.equal(nextFaqDisplayOrder(rows), 4);
assert.equal(
  activeFaqItems([
    { isActive: true },
    { isActive: false },
    { isActive: true },
  ]).length,
  2,
);

const migration = readSrc(
  "supabase/migrations/20260923120000_storefront_faq_items.sql",
);
assert.match(migration, /create table public.storefront_faq_items/);
assert.match(migration, /storefront_faq_items_question_not_blank/);
assert.match(migration, /storefront_faq_items_answer_not_blank/);
assert.match(migration, /set_updated_at/);
assert.match(migration, /to anon\nusing \(is_active = true\)/);
assert.match(migration, /_current_staff_role_code\(\) in \('owner', 'manager'\)/);
assert.doesNotMatch(migration, /for delete/);
assert.doesNotMatch(migration, /Please note:/);
for (const item of STOREFRONT_FAQ_ITEMS) {
  assert.match(migration, new RegExp(item.question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

const actions = readSrc("src/workspaces/library/customer-qa/actions.ts");
assert.match(actions, /canManageLibrary/);
assert.match(actions, /normalizeFaqQuestion/);
assert.match(actions, /normalizeFaqAnswer/);
assert.match(actions, /createStorefrontFaqItemAction/);
assert.match(actions, /updateStorefrontFaqItemAction/);
assert.match(actions, /setStorefrontFaqItemActiveAction/);
assert.match(actions, /moveStorefrontFaqItemAction/);
assert.doesNotMatch(actions, /\.delete\(/);

const page = readSrc("src/app/(app)/library/customer-qa/page.tsx");
assert.match(page, /canManageLibrary/);
assert.match(page, /CustomerQaManager/);

const manager = readSrc(
  "src/workspaces/library/customer-qa/CustomerQaManager.tsx",
);
assert.match(manager, /Move up/);
assert.match(manager, /Move down/);
assert.match(manager, /Deactivate/);
assert.match(manager, /Reactivate/);
assert.match(manager, /FormTextarea/);
assert.doesNotMatch(manager, /Delete/);

const nav = readSrc("src/workspaces/library/LibraryNav.tsx");
assert.match(nav, /href: "\/library\/customer-qa"/);
assert.match(nav, /label: "Customer Q&A"/);

console.log("test-library-customer-qa: ok");
