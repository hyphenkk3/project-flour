import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startVisibilityAwarePolling } from "../src/lib/visibility-aware-polling.ts";
import type {
  VisibilityDocumentTarget,
  VisibilityTimerTarget,
} from "../src/lib/visibility-aware-polling.ts";

const POLL_MS = 30_000;
let passed = 0;

class FakeTimers implements VisibilityTimerTarget {
  now = 0;
  private nextId = 1;
  private intervals = new Map<
    number,
    { callback: () => void; intervalMs: number; nextAt: number }
  >();
  private timeouts = new Map<number, { callback: () => void; at: number }>();

  setInterval(callback: () => void, intervalMs: number): number {
    const id = this.nextId++;
    this.intervals.set(id, {
      callback,
      intervalMs,
      nextAt: this.now + intervalMs,
    });
    return id;
  }

  clearInterval(intervalId: number): void {
    this.intervals.delete(intervalId);
  }

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId++;
    this.timeouts.set(id, { callback, at: this.now + delayMs });
    return id;
  }

  clearTimeout(timeoutId: number): void {
    this.timeouts.delete(timeoutId);
  }

  advanceBy(durationMs: number): void {
    const target = this.now + durationMs;
    while (true) {
      const interval = [...this.intervals.entries()]
        .filter(([, timer]) => timer.nextAt <= target)
        .sort((a, b) => a[1].nextAt - b[1].nextAt)[0];
      const timeout = [...this.timeouts.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!interval && !timeout) break;
      if (timeout && (!interval || timeout[1].at <= interval[1].nextAt)) {
        this.now = timeout[1].at;
        this.timeouts.delete(timeout[0]);
        timeout[1].callback();
        continue;
      }
      if (!interval) continue;
      const [id, timer] = interval;
      this.now = timer.nextAt;
      if (!this.intervals.has(id)) continue;
      timer.nextAt += timer.intervalMs;
      timer.callback();
    }
    this.now = target;
  }

  get activeIntervals(): number {
    return this.intervals.size;
  }

  get activeTimeouts(): number {
    return this.timeouts.size;
  }
}

class FakeDocument implements VisibilityDocumentTarget {
  visibilityState: string;
  private listeners = new Set<() => void>();

  constructor(initialState: string = "visible") {
    this.visibilityState = initialState;
  }

  addEventListener(_type: "visibilitychange", listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(
    _type: "visibilitychange",
    listener: () => void,
  ): void {
    this.listeners.delete(listener);
  }

  setVisibility(state: "visible" | "hidden"): void {
    this.visibilityState = state;
    for (const listener of this.listeners) listener();
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

function check(name: string, run: () => void): void {
  run();
  passed += 1;
  console.log(`PASS ${name}`);
}

function start(
  refresh: () => void,
  documentTarget: VisibilityDocumentTarget | null,
  timerTarget: FakeTimers,
  onVisible = refresh,
) {
  return startVisibilityAwarePolling({
    intervalMs: POLL_MS,
    poll: refresh,
    onVisible,
    documentTarget,
    timerTarget,
    now: () => timerTarget.now,
  });
}

check("visible polling retains the 30-second cadence", () => {
  const clock = new FakeTimers();
  const doc = new FakeDocument();
  let calls = 0;
  const polling = start(() => calls++, doc, clock);
  clock.advanceBy(60_500);
  assert.equal(calls, 2);
  assert.equal(clock.activeIntervals, 1);
  polling.dispose();
});

check("baseline unguarded interval polls twice during a hidden minute", () => {
  const clock = new FakeTimers();
  let calls = 0;
  const intervalId = clock.setInterval(() => calls++, POLL_MS);
  clock.advanceBy(60_000);
  assert.equal(calls, 2);
  clock.clearInterval(intervalId);
});

check("hidden tab pauses fallback polling and resume reconciles once", () => {
  const clock = new FakeTimers();
  const doc = new FakeDocument();
  let polls = 0;
  let reconciliations = 0;
  const polling = start(
    () => polls++,
    doc,
    clock,
    () => reconciliations++,
  );
  doc.setVisibility("hidden");
  assert.equal(clock.activeIntervals, 0);
  clock.advanceBy(60_000);
  assert.equal(polls, 0);
  doc.setVisibility("visible");
  assert.equal(reconciliations, 1);
  assert.equal(clock.activeIntervals, 1);
  clock.advanceBy(POLL_MS - 1);
  assert.equal(polls, 0);
  clock.advanceBy(1);
  assert.equal(polls, 0);
  clock.advanceBy(120);
  assert.equal(polls, 1);
  polling.dispose();
});

check("repeated visible events do not create duplicate reconciliation", () => {
  const clock = new FakeTimers();
  const doc = new FakeDocument("hidden");
  let reconciliations = 0;
  const polling = start(() => {}, doc, clock, () => reconciliations++);
  doc.setVisibility("visible");
  doc.setVisibility("visible");
  assert.equal(reconciliations, 1);
  assert.equal(clock.activeIntervals, 1);
  polling.dispose();
});

check("rapid hide/show cycles keep one timer and one reconciliation per resume", () => {
  const clock = new FakeTimers();
  const doc = new FakeDocument();
  let reconciliations = 0;
  const polling = start(() => {}, doc, clock, () => reconciliations++);
  doc.setVisibility("hidden");
  doc.setVisibility("visible");
  doc.setVisibility("hidden");
  doc.setVisibility("visible");
  assert.equal(reconciliations, 2);
  assert.equal(clock.activeIntervals, 1);
  polling.dispose();
});

check("Realtime events remain deliverable while fallback polling is paused", () => {
  const clock = new FakeTimers();
  const doc = new FakeDocument("hidden");
  let reconciliations = 0;
  let realtimeEvents = 0;
  const polling = start(() => {}, doc, clock, () => reconciliations++);
  const realtimeHandler = () => {
    realtimeEvents += 1;
    polling.noteRealtimeEvent();
  };
  realtimeHandler();
  assert.equal(realtimeEvents, 1);
  assert.equal(clock.activeIntervals, 0);
  doc.setVisibility("visible");
  assert.equal(reconciliations, 1);
  polling.dispose();
});

check("a Realtime event at a poll boundary suppresses the duplicate poll", () => {
  const clock = new FakeTimers();
  const doc = new FakeDocument();
  let polls = 0;
  const polling = start(() => polls++, doc, clock);
  clock.advanceBy(POLL_MS - 100);
  polling.noteRealtimeEvent();
  clock.advanceBy(100);
  assert.equal(polls, 0);
  clock.advanceBy(POLL_MS - 100 + 100);
  clock.advanceBy(120);
  assert.equal(polls, 1);
  polling.dispose();
});

check("a Realtime event arriving just after a poll tick is coalesced", () => {
  const clock = new FakeTimers();
  const doc = new FakeDocument();
  let polls = 0;
  const polling = start(() => polls++, doc, clock);
  clock.advanceBy(POLL_MS);
  clock.advanceBy(100);
  polling.noteRealtimeEvent();
  clock.advanceBy(20);
  assert.equal(polls, 0);
  clock.advanceBy(POLL_MS);
  clock.advanceBy(120);
  assert.equal(polls, 1);
  polling.dispose();
});

check("Home Realtime refresh is immediate and cancels queued polling work", () => {
  const clock = new FakeTimers();
  const doc = new FakeDocument();
  let refreshes = 0;
  const polling = start(() => refreshes++, doc, clock);
  clock.advanceBy(POLL_MS);
  const queuedFallbackId = clock.setTimeout(() => refreshes++, 120);
  assert.equal(clock.activeTimeouts, 2);

  polling.runRealtimeRefreshImmediately(
    () => refreshes++,
    () => clock.clearTimeout(queuedFallbackId),
  );

  assert.equal(refreshes, 1, "Realtime refresh runs synchronously");
  assert.equal(
    clock.activeTimeouts,
    0,
    "both helper and component fallback timers are cancelled",
  );
  clock.advanceBy(120);
  assert.equal(refreshes, 1, "the cancelled fallback cannot duplicate refresh");
  polling.dispose();
});

check("multiple tabs pause and resume independently", () => {
  const clock = new FakeTimers();
  const firstDoc = new FakeDocument();
  const secondDoc = new FakeDocument("hidden");
  let firstCalls = 0;
  let secondCalls = 0;
  const first = start(() => firstCalls++, firstDoc, clock);
  const second = start(() => secondCalls++, secondDoc, clock);
  clock.advanceBy(POLL_MS);
  clock.advanceBy(120);
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 0);
  firstDoc.setVisibility("hidden");
  secondDoc.setVisibility("visible");
  assert.equal(secondCalls, 1);
  assert.equal(clock.activeIntervals, 1);
  first.dispose();
  second.dispose();
});

check("missing visibility API preserves the existing polling behavior", () => {
  const clock = new FakeTimers();
  const doc = { addEventListener() {}, removeEventListener() {} };
  let calls = 0;
  const polling = start(() => calls++, doc, clock);
  clock.advanceBy(60_000);
  assert.equal(calls, 2);
  assert.equal(clock.activeIntervals, 1);
  polling.dispose();
});

check("unmount cleanup removes timer and visibility listener", () => {
  const clock = new FakeTimers();
  const doc = new FakeDocument();
  let calls = 0;
  const polling = start(() => calls++, doc, clock);
  clock.advanceBy(POLL_MS);
  assert.equal(calls, 0);
  polling.dispose();
  assert.equal(clock.activeIntervals, 0);
  assert.equal(doc.listenerCount, 0);
  clock.advanceBy(60_120);
  doc.setVisibility("hidden");
  doc.setVisibility("visible");
  assert.equal(calls, 0);

  let remountedCalls = 0;
  const remounted = start(() => remountedCalls++, doc, clock);
  assert.equal(doc.listenerCount, 1);
  assert.equal(clock.activeIntervals, 1);
  clock.advanceBy(POLL_MS + 120);
  assert.equal(remountedCalls, 1);
  remounted.dispose();
  assert.equal(doc.listenerCount, 0);
});

check("all four boards retain Realtime subscriptions and cleanup", () => {
  const files = [
    "src/workspaces/home/HomeLiveRefresh.tsx",
    "src/workspaces/owner/OperationsLiveBoard.tsx",
    "src/workspaces/bakery/BakeryLiveBoard.tsx",
    "src/workspaces/collection/CollectionLiveBoard.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(resolve(file), "utf8");
    assert.match(source, /startVisibilityAwarePolling/);
    assert.match(source, /\.channel\(/);
    assert.match(source, /\.subscribe\(/);
    assert.match(source, /removeChannel\(channel\)/);
  }

  const operations = readFileSync(
    resolve("src/workspaces/owner/OperationsLiveBoard.tsx"),
    "utf8",
  );
  const bakery = readFileSync(
    resolve("src/workspaces/bakery/BakeryLiveBoard.tsx"),
    "utf8",
  );
  const collection = readFileSync(
    resolve("src/workspaces/collection/CollectionLiveBoard.tsx"),
    "utf8",
  );
  assert.match(operations, /handleIncomingInsert\(row\.id\)/);
  assert.match(operations, /handleIncomingUpdate\(row\.id\)/);
  assert.match(bakery, /handleIncoming\(row\.id\)/);
  assert.match(collection, /status === "SUBSCRIBED"/);
  assert.match(collection, /status === "CHANNEL_ERROR" \|\| status === "TIMED_OUT"/);

  const home = readFileSync(
    resolve("src/workspaces/home/HomeLiveRefresh.tsx"),
    "utf8",
  );
  assert.equal(
    (home.match(/refreshRealtimeImmediately\(\);/g) ?? []).length,
    4,
    "all four Home Realtime event handlers refresh immediately",
  );
  assert.match(home, /poll:\s*refreshSoon[\s\S]*onVisible:\s*refreshSoon/);
});

console.log(`Staff hidden-tab polling checks: ${passed} PASS, 0 FAIL.`);
console.log(
  "Modelled fallback requests per tab: visible 2/min; hidden baseline 2/min; optimized hidden 0/min (2 avoided).",
);
