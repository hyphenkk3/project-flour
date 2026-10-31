#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const baseline = process.env.ESLINT_BASELINE_SHA;
const files = process.argv.slice(2);

if (!baseline || !/^[0-9a-f]{40}$/.test(baseline) || files.length === 0) {
  console.error("Usage: ESLINT_BASELINE_SHA=<commit> node scripts/test-eslint-no-new-findings.mjs <file...>");
  process.exit(2);
}

function eslintDiagnostics(source, file) {
  const result = spawnSync(
    "npx",
    ["eslint", "--format", "json", "--stdin", "--stdin-filename", file],
    { input: source, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error(`ESLint did not return JSON for ${file}: ${result.stderr || result.stdout}`);
  }
  return payload.flatMap((entry) => entry.messages).map((message) => ({
    ruleId: message.ruleId ?? "fatal",
    severity: message.severity,
    // ESLint appends location and source excerpts; line shifts are not new diagnostics.
    message: message.message.split(/\n\n\//, 1)[0],
  }));
}

function countByKey(items) {
  const counts = new Map();
  for (const item of items) {
    const key = JSON.stringify(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

let added = 0;
let baselineCount = 0;
let candidateCount = 0;

for (const file of files) {
  const base = spawnSync("git", ["show", `${baseline}:${file}`], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (base.status !== 0) {
    console.error(`Unable to read ${file} from ESLint baseline ${baseline}: ${base.stderr}`);
    process.exit(2);
  }

  const before = eslintDiagnostics(base.stdout, file);
  const after = eslintDiagnostics(readFileSync(file, "utf8"), file);
  const beforeCounts = countByKey(before);
  const afterCounts = countByKey(after);
  baselineCount += before.length;
  candidateCount += after.length;

  for (const [key, afterCount] of afterCounts) {
    const excess = afterCount - (beforeCounts.get(key) ?? 0);
    if (excess > 0) {
      added += excess;
      console.error(`NEW ESLint finding in ${file}: ${key}`);
    }
  }
}

console.log(`release_scoped_eslint_baseline_findings=${baselineCount}`);
console.log(`release_scoped_eslint_candidate_findings=${candidateCount}`);
console.log(`release_scoped_eslint_new_findings=${added}`);
if (added > 0) process.exit(1);
console.log("Release-scoped ESLint regression delta: PASS");
