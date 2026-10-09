/**
 * Pure email-rendering checks. No provider, database, or network calls.
 * Run: node --import /private/tmp/project-flour-phase-a-test-runner/node_modules/tsx/dist/loader.mjs scripts/test-staff-notification-email-links.ts
 */
import assert from "node:assert/strict";

import { buildStaffNotificationEmail } from "../src/foundation/staff/staff-notification-email";
import type { NewOrderNotificationSummary } from "../src/foundation/staff/staff-notification-new-order";

const keys = [
  "VERCEL_ENV",
  "VERCEL_GIT_COMMIT_REF",
  "NEXT_PUBLIC_SITE_URL",
] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

function withEmailEnvironment(
  environment: "dev" | "production",
  run: () => void,
  origin?: string,
) {
  process.env.VERCEL_ENV = environment === "dev" ? "preview" : "production";
  process.env.VERCEL_GIT_COMMIT_REF =
    environment === "dev" ? "debug/mobile-add-to-order-safari" : "main";
  process.env.NEXT_PUBLIC_SITE_URL =
    origin ??
    (environment === "dev"
      ? "https://dev.whitebird.asia"
      : "https://whitebird.asia");
  run();
}

const summary: NewOrderNotificationSummary = {
  guestName: "Synthetic guest",
  guestPhone: "0000000000",
  orderNumber: "SYNTHETIC-1",
  pickupDate: "2026-10-10",
  pickupTime: "13:00",
  fulfilmentMethod: "pickup",
  fulfilmentLabel: "Pickup",
  notes: null,
  items: [],
  addons: [],
  total: 0,
  delivery: null,
  dineIn: null,
};

function standard(
  href: string | null,
  code:
    | "fresh_pick_walk_in_hold_reminder"
    | "order_paid"
    | "approval_required"
    | "waiting_list_new_request" = "fresh_pick_walk_in_hold_reminder",
) {
  return buildStaffNotificationEmail({
    code,
    title: "Synthetic notification",
    description: "Keep <this> & that safe",
    href,
  });
}

function newOrder(href: string | null) {
  return buildStaffNotificationEmail({
    code: "new_order",
    title: "New order received",
    description: "Synthetic order",
    href,
    newOrder: summary,
  });
}

function assertNoLink(html: string) {
  assert.doesNotMatch(html, /<a\s/i);
  assert.doesNotMatch(html, /href=/i);
}

try {
  for (const [environment, expectedOrigin] of [
    ["dev", "https://dev.whitebird.asia"],
    ["production", "https://whitebird.asia"],
  ] as const) {
    withEmailEnvironment(environment, () => {
      const freshPick = standard("/customer-operations/fresh-picks");
      assert.ok(
        freshPick.html.includes(
          `href="${expectedOrigin}/customer-operations/fresh-picks"`,
        ),
      );
      assert.equal(freshPick.subject, "Synthetic notification");
      assert.ok(freshPick.html.includes("Keep &lt;this&gt; &amp; that safe"));
      assert.ok(freshPick.html.includes("View in Whitebird</a>"));

      const payment = standard("/owner/orders/synthetic", "order_paid");
      assert.ok(
        payment.html.includes(
          `href="${expectedOrigin}/owner/orders/synthetic"`,
        ),
      );
      const approval = standard("/owner/approvals", "approval_required");
      assert.ok(
        approval.html.includes(`href="${expectedOrigin}/owner/approvals"`),
      );

      const parsedOrder = newOrder("/owner/orders/synthetic");
      assert.ok(
        parsedOrder.html.includes(
          `href="${expectedOrigin}/owner/orders/synthetic"`,
        ),
      );
      assert.equal(parsedOrder.subject, "New order received — SYNTHETIC-1");
      assert.ok(parsedOrder.html.includes("<h2>New order received</h2>"));
      assert.ok(parsedOrder.html.includes("View in Whitebird →</a>"));

      const queryAndFragment = standard(
        "/customer-operations/fresh-picks?filter=walk-in&state=held#details",
      );
      assert.ok(
        queryAndFragment.html.includes(
          `href="${expectedOrigin}/customer-operations/fresh-picks?filter=walk-in&amp;state=held#details"`,
        ),
      );
      assert.doesNotMatch(freshPick.html, /href="\//);
      assert.doesNotMatch(parsedOrder.html, /href="\//);
      if (environment === "dev") {
        assert.doesNotMatch(
          freshPick.html,
          /project-flour\.vercel\.app|href="https:\/\/whitebird\.asia/,
        );
      } else {
        assert.doesNotMatch(
          freshPick.html,
          /href="https:\/\/dev\.whitebird\.asia/,
        );
      }
    });
  }

  withEmailEnvironment("dev", () => {
    const waitingListPath =
      "/bakery/availability?date=2026-10-10&wlCake=11111111-1111-4111-8111-111111111111&wlSize=22222222-2222-4222-8222-222222222222#waiting-list-heading";
    const waitingList = standard(waitingListPath, "waiting_list_new_request");
    assert.ok(
      waitingList.html.includes(
        'href="https://dev.whitebird.asia/bakery/availability?date=2026-10-10&amp;wlCake=11111111-1111-4111-8111-111111111111&amp;wlSize=22222222-2222-4222-8222-222222222222#waiting-list-heading"',
      ),
    );
    assert.doesNotMatch(waitingList.html, /href="\//);
    assert.doesNotMatch(
      waitingList.html,
      /href="https:\/\/whitebird\.asia|project-flour\.vercel\.app/,
    );
  });

  withEmailEnvironment("dev", () => {
    const linkedStandard = standard("/customer-operations/fresh-picks");
    const linkedNewOrder = newOrder("/owner/orders/synthetic");
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const withoutOrigin = standard("/customer-operations/fresh-picks");
    const newOrderWithoutOrigin = newOrder("/owner/orders/synthetic");
    assertNoLink(withoutOrigin.html);
    assertNoLink(newOrderWithoutOrigin.html);
    assert.equal(withoutOrigin.subject, linkedStandard.subject);
    assert.equal(newOrderWithoutOrigin.subject, linkedNewOrder.subject);
    assert.equal(
      withoutOrigin.html,
      linkedStandard.html.replace(
        /<p><a href="[^"]+">View in Whitebird<\/a><\/p>/,
        "",
      ),
    );
    assert.equal(
      newOrderWithoutOrigin.html,
      linkedNewOrder.html.replace(
        /<p><a href="[^"]+">View in Whitebird →<\/a><\/p>/,
        "",
      ),
    );
  });

  withEmailEnvironment("dev", () => {
    for (const invalid of [
      "//other.example/path",
      "https://other.example/path",
      "http://dev.whitebird.asia/path",
      "https://whitebird.asia/path",
      "https://dev.whitebird.asia/path",
      "customer-operations/fresh-picks",
      "/bad\\host",
      "/bad%ZZ",
      "/bad\npath",
    ]) {
      assertNoLink(standard(invalid).html);
      assertNoLink(newOrder(invalid).html);
    }
    assertNoLink(standard(null).html);
    assertNoLink(newOrder(null).html);
  });

  for (const [environment, invalidOrigin] of [
    ["dev", ""],
    ["dev", "http://dev.whitebird.asia"],
    ["dev", "https://project-flour.vercel.app"],
    ["dev", "https://whitebird.asia"],
    ["dev", "https://dev.whitebird.asia:8443"],
    ["dev", "https://user:pass@dev.whitebird.asia"],
    ["dev", "https://dev.whitebird.asia/path"],
    ["dev", "https://dev.whitebird.asia?query=1"],
    ["dev", "https://dev.whitebird.asia#fragment"],
    ["dev", "not a URL"],
    ["production", "https://dev.whitebird.asia"],
  ] as const) {
    withEmailEnvironment(environment, () => {
      process.env.NEXT_PUBLIC_SITE_URL = invalidOrigin;
      assertNoLink(standard("/customer-operations/fresh-picks").html);
      assertNoLink(newOrder("/owner/orders/synthetic").html);
    });
  }

  withEmailEnvironment("dev", () => {
    process.env.VERCEL_GIT_COMMIT_REF = "some-other-preview";
    assertNoLink(standard("/customer-operations/fresh-picks").html);
  });
  withEmailEnvironment("production", () => {
    delete process.env.VERCEL_GIT_COMMIT_REF;
    assert.ok(
      newOrder("/owner/orders/synthetic").html.includes(
        'href="https://whitebird.asia/owner/orders/synthetic"',
      ),
    );
  });

  console.log("PASS staff notification email links (pure rendering)");
} finally {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
