/**
 * Publish catalogue: Draft → Active, without website override side effects.
 * Run: npx tsx scripts/test-library-catalogue-publish.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CATALOGUE_PUBLISHED_QUERY,
  CATALOGUE_UNPUBLISHED_QUERY,
} from "@/workspaces/library/collections/catalogue";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const actionsSrc = readSrc("src/workspaces/library/collections/actions.ts");
const publishFn = actionsSrc.slice(
  actionsSrc.indexOf("publishCatalogueAction"),
  actionsSrc.indexOf("unpublishCatalogueAction"),
);
assert.match(publishFn, /requireLibraryStaff/);
assert.match(publishFn, /update\(\{ status: "active" \}\)/);
assert.match(publishFn, /eq\("status", "draft"\)/);
assert.match(publishFn, new RegExp(`${CATALOGUE_PUBLISHED_QUERY}`));
assert.doesNotMatch(publishFn, /collection_cakes/);
assert.doesNotMatch(publishFn, /library_cakes/);
assert.doesNotMatch(publishFn, /library_cake_sizes/);
assert.doesNotMatch(publishFn, /website_override/);
assert.doesNotMatch(publishFn, /storefront_current_collection/);

const unpublishFn = actionsSrc.slice(
  actionsSrc.indexOf("unpublishCatalogueAction"),
  actionsSrc.indexOf("function revalidateCollectionPaths"),
);
assert.match(unpublishFn, /requireLibraryStaff/);
assert.match(unpublishFn, /update\(\{ status: "draft" \}\)/);
assert.match(unpublishFn, /eq\("status", "active"\)/);
assert.match(unpublishFn, new RegExp(`${CATALOGUE_UNPUBLISHED_QUERY}`));
assert.doesNotMatch(unpublishFn, /collection_cakes/);
assert.doesNotMatch(unpublishFn, /library_cakes/);
assert.doesNotMatch(unpublishFn, /library_cake_sizes/);
assert.doesNotMatch(unpublishFn, /website_override/);

const buttonSrc = readSrc(
  "src/workspaces/library/collections/CataloguePublishButton.tsx",
);
assert.match(buttonSrc, /Publish catalogue/);
assert.match(buttonSrc, /publishCatalogueAction/);
assert.match(buttonSrc, /does not make it the website catalogue/);

const pageSrc = readSrc("src/app/(app)/library/collections/[id]/page.tsx");
assert.match(pageSrc, /CataloguePublishButton/);
assert.match(pageSrc, /status === "draft"/);
assert.match(pageSrc, /Catalogue published/);
assert.match(pageSrc, /Website override is on/);
assert.match(pageSrc, /CatalogueUnpublishButton/);
assert.match(pageSrc, /status === "active"/);
assert.match(pageSrc, /Catalogue unpublished/);

const unpublishSrc = readSrc(
  "src/workspaces/library/collections/CatalogueUnpublishButton.tsx",
);
assert.match(unpublishSrc, /Unpublish catalogue/);
assert.match(unpublishSrc, /border-ink/);
assert.match(unpublishSrc, /text-ink/);
assert.match(unpublishSrc, /font-semibold/);
assert.doesNotMatch(unpublishSrc, /bg-ink text-mist/);

const overridePanel = readSrc(
  "src/workspaces/library/collections/CatalogueWebsiteOverridePanel.tsx",
);
assert.match(overridePanel, /Publish as website override/);
assert.match(overridePanel, /setCatalogueWebsiteOverrideAction/);

const storefrontSrc = readSrc(
  "supabase/migrations/20260816180000_catalogue_website_override.sql",
);
assert.match(storefrontSrc, /website_override = true/);
assert.match(storefrontSrc, /purpose = 'monthly'/);

console.log("PASS library catalogue publish (static)");
