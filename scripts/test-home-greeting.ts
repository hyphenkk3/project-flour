/**
 * Home cockpit time-aware greeting.
 * Run: npx tsx scripts/test-home-greeting.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  homeGreetingPeriodFromHour,
  homeGreetingTitle,
  singaporeHourOfDay,
} from "@/workspaces/home/greeting";

assert.equal(homeGreetingPeriodFromHour(8), "morning");
assert.equal(homeGreetingPeriodFromHour(14), "afternoon");
assert.equal(homeGreetingPeriodFromHour(20), "evening");
assert.equal(homeGreetingPeriodFromHour(12), "afternoon");
assert.equal(homeGreetingPeriodFromHour(17), "evening");
assert.equal(homeGreetingPeriodFromHour(4), "evening");
assert.equal(homeGreetingPeriodFromHour(5), "morning");
assert.equal(homeGreetingPeriodFromHour(11), "morning");
assert.equal(homeGreetingPeriodFromHour(16), "afternoon");

assert.equal(
  homeGreetingTitle("Amy", new Date("2026-08-15T00:00:00.000Z")),
  "Good morning, Amy",
);
assert.equal(
  homeGreetingTitle("Amy", new Date("2026-08-15T06:00:00.000Z")),
  "Good afternoon, Amy",
);
assert.equal(
  homeGreetingTitle("Amy", new Date("2026-08-15T10:00:00.000Z")),
  "Good evening, Amy",
);

const noonSgt = new Date("2026-08-15T04:00:00.000Z");
assert.equal(singaporeHourOfDay(noonSgt), 12);
assert.equal(homeGreetingTitle("Owner (Dev)", noonSgt), "Good afternoon, Owner (Dev)");

const fivePmSgt = new Date("2026-08-15T09:00:00.000Z");
assert.equal(singaporeHourOfDay(fivePmSgt), 17);
assert.equal(homeGreetingTitle("Manager", fivePmSgt), "Good evening, Manager");

const uiSrc = readFileSync(resolve("src/workspaces/home/HomeCockpit.tsx"), "utf8");
assert.match(uiSrc, /homeGreetingTitle/);
assert.doesNotMatch(uiSrc, /title=\{`Good morning, \$\{staffDisplayName\}`\}/);

console.log("PASS Home greeting");
