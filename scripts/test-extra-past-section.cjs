const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const helperSource = fs.readFileSync(
  "src/engines/extra/past-stock-display.ts",
  "utf8",
);
const helperCompiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const helperExports = {};
vm.runInNewContext(helperCompiled, { exports: helperExports });

assert.equal(helperExports.PAST_STOCK_PAGE_SIZE, 20);
const largeHistory = Array.from({ length: 105 }, (_, index) => ({
  id: `past-${index}`,
}));
assert.equal(
  helperExports.visiblePastStockPage(largeHistory, 20).length,
  20,
  "large Past lists render in bounded batches",
);
assert.equal(
  helperExports.visiblePastStockPage(largeHistory, 20)[0].id,
  "past-0",
  "the original order is preserved",
);
assert.equal(
  helperExports.visiblePastStockPage(largeHistory, 200).length,
  105,
  "loading more exposes every retained Past record",
);

const board = fs.readFileSync("src/workspaces/extra/ExtraBoard.tsx", "utf8");
assert.match(board, /const \[pastOpen, setPastOpen\] = useState\(false\)/);
assert.match(board, /aria-expanded=\{pastOpen\}/);
assert.match(board, /pastOpen \? "Hide Past" : "View Past"/);
assert.match(board, /\{past\.length\}/, "the full item count remains visible");
assert.match(board, /visiblePastStockPage\(past, pastVisibleCount\)/);
assert.match(board, /Load more Past items/);
assert.match(board, /Undo Reject\s*<\/button>/);
assert.match(board, /Undo availability\s*<\/button>/);
assert.match(board, /setPastOpen\(\(value\) => !value\)/);

console.log("past_section_collapse_and_pagination=PASS");
