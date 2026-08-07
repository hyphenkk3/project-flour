/**
 * Milestone 1 seed (post-architecture unify):
 * - Ensures Master Library cakes + sizes + photos
 * - Active collection for current month
 * - collection_cakes links (no duplicated cake records)
 *
 * Prerequisites:
 * - Apply migrations through 20260806150000_milestone1_architecture_unify.sql
 * - npm run seed:dev for Owner account
 *
 * Usage: npm run seed:milestone1
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function currentMonthStartSingapore() {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }),
  );
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

const cakesSeed = [
  {
    name: "Chocolate D'Amour",
    description:
      "A rich chocolate celebration cake with a smooth finish — a Whitebird favourite.",
    image:
      "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=80",
    sizes: [
      { label: '6"', price: 125, sort_order: 0 },
      { label: '8"', price: 165, sort_order: 1 },
    ],
  },
  {
    name: "Macadamia",
    description:
      "Buttery sponge with roasted macadamia — available in more than one size for your gathering.",
    image:
      "https://images.unsplash.com/photo-1464349095439-cdd002d292a4?auto=format&fit=crop&w=1200&q=80",
    sizes: [
      { label: '4"', price: 78, sort_order: 0 },
      { label: '6"', price: 135, sort_order: 1 },
    ],
  },
];

async function ensureLibraryCake(seed) {
  const { data: existing } = await admin
    .from("library_cakes")
    .select("id")
    .eq("name", seed.name)
    .maybeSingle();

  if (existing?.id) {
    return existing.id;
  }

  const { data: created, error } = await admin
    .from("library_cakes")
    .insert({
      name: seed.name,
      description: seed.description,
      category: "celebration",
      status: "active",
      allergens: [],
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  const { error: sizesError } = await admin.from("library_cake_sizes").insert(
    seed.sizes.map((size) => ({
      cake_id: created.id,
      label: size.label,
      price: size.price,
      sort_order: size.sort_order,
      serves: null,
    })),
  );
  if (sizesError) {
    throw sizesError;
  }

  const { error: photoError } = await admin.from("library_cake_photos").insert({
    cake_id: created.id,
    image_url: seed.image,
    alt_text: seed.name,
    sort_order: 0,
  });
  if (photoError) {
    throw photoError;
  }

  console.log("Created library cake:", seed.name);
  return created.id;
}

async function main() {
  const month = currentMonthStartSingapore();
  const collectionName = `Collection ${month.slice(0, 7)}`;

  const { data: existingCollection } = await admin
    .from("collections")
    .select("id")
    .eq("status", "active")
    .eq("month", month)
    .maybeSingle();

  let collectionId = existingCollection?.id;

  if (!collectionId) {
    const { data: created, error } = await admin
      .from("collections")
      .insert({
        name: collectionName,
        month,
        status: "active",
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }
    collectionId = created.id;
    console.log("Created collection:", collectionName);
  } else {
    console.log("Using existing active collection for", month);
  }

  let sortOrder = 0;
  for (const seed of cakesSeed) {
    const libraryCakeId = await ensureLibraryCake(seed);

    const { data: link } = await admin
      .from("collection_cakes")
      .select("id")
      .eq("collection_id", collectionId)
      .eq("library_cake_id", libraryCakeId)
      .maybeSingle();

    if (!link) {
      const { error } = await admin.from("collection_cakes").insert({
        collection_id: collectionId,
        library_cake_id: libraryCakeId,
        available: true,
        sort_order: sortOrder,
      });
      if (error) {
        throw error;
      }
      console.log("Linked to collection:", seed.name);
    } else {
      console.log("Already linked:", seed.name);
    }
    sortOrder += 1;
  }

  console.log("Milestone 1 catalog ready (Master Library + collection links).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
