/** Offline query-contract test: no hosted database or application secrets. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  "src/workspaces/storefront/catalog/queries.ts",
  "utf8",
);
const start = source.indexOf(
  "export async function listStorefrontCakeSizesForValidation(",
);
const end = source.indexOf("\nexport async function", start + 1);
assert.ok(start >= 0 && end > start);
const isolated = ts.transpileModule(source.slice(start, end), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const cakeId = "10000000-0000-0000-0000-000000000001";
const sizeId = "20000000-0000-0000-0000-000000000004";
let selected = "";
let requested: string[] = [];
let response: { data: unknown; error: { message: string } | null } = {
  data: [
    {
      id: cakeId,
      name: "Synthetic cake",
      library_cake_sizes: [
        {
          id: sizeId,
          label: '4"',
          available_from: "2026-11-01",
          available_until: null,
        },
      ],
    },
  ],
  error: null,
};
let clients = 0;
const exports: Record<string, (ids: readonly string[]) => Promise<unknown[]>> =
  {};
vm.runInNewContext(isolated, {
  exports,
  requestedStorefrontCakeIds: (ids: string[]) => [
    ...new Set(ids.map((id) => id.trim()).filter(Boolean)),
  ],
  createClient: async () => {
    clients++;
    return {
      from: (table: string) => {
        assert.equal(table, "library_cakes");
        return {
          select: (projection: string) => {
            selected = projection;
            return {
              in: async (column: string, ids: string[]) => {
                assert.equal(column, "id");
                requested = ids;
                return response;
              },
            };
          },
        };
      },
    };
  },
});

async function main() {
  const read = exports.listStorefrontCakeSizesForValidation;
  assert.equal((await read([])).length, 0);
  assert.equal(clients, 0, "Empty validation must not query the database");
  const cakes = await read([cakeId, cakeId]);
  assert.deepEqual(requested, [cakeId]);
  assert.equal(clients, 1, "Validation uses a fresh session-aware client");
  assert.equal(
    selected,
    "id,name,library_cake_sizes(id,label,available_from,available_until)",
  );
  for (const omitted of [
    "photos",
    "categories",
    "tags",
    "price",
    "description",
    "allergens",
    "sharing_guide",
  ])
    assert.ok(
      !selected.includes(omitted),
      `Validation must not fetch ${omitted}`,
    );
  assert.deepEqual(JSON.parse(JSON.stringify(cakes)), [
    {
      id: cakeId,
      name: "Synthetic cake",
      sizes: [
        {
          id: sizeId,
          size: '4"',
          availableFrom: "2026-11-01",
          availableUntil: null,
        },
      ],
    },
  ]);
  response = { data: [], error: null }; // An RLS-hidden cake remains unavailable.
  assert.equal((await read([cakeId])).length, 0);
  response = { data: null, error: { message: "Database unavailable" } };
  await assert.rejects(read([cakeId]), /Database unavailable/);
  console.log(
    "PASS: live narrow projection, session-aware RLS path, deduplication, hidden rows and query errors",
  );
}
void main();
