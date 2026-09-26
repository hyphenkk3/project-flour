/**
 * DEV-only measurement of checkout date-confirmation queries.
 * Does not mutate data. Run: npx tsx scripts/measure-checkout-date-confirmation.ts
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

function ms(started: number): number {
  return Math.round(performance.now() - started);
}

async function timed<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ label: string; ms: number; value: T }> {
  const started = performance.now();
  const value = await fn();
  const elapsed = ms(started);
  console.log(`${label.padEnd(42)} ${String(elapsed).padStart(5)} ms`);
  return { label, ms: elapsed, value };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing Supabase env.");
  }
  if (!url.includes("tzwtpxdcggesgjaqxkqr")) {
    throw new Error("Refusing to run outside project-flour-dev.");
  }

  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const pickupDate = "2026-10-01";
  const { data: cake } = await supabase
    .from("library_cakes")
    .select("id, name")
    .ilike("name", "%Japanese Strawberry%")
    .limit(1)
    .maybeSingle();
  const cakeId = cake?.id ?? "";
  console.log(`cake=${cake?.name ?? "none"} id=${cakeId || "none"} pickup=${pickupDate}`);
  console.log("--- sequential (mirrors current server-action bodies) ---");

  await timed("storefront_collection_for_pickup_date", async () => {
    const { error } = await supabase.rpc("storefront_collection_for_pickup_date", {
      p_pickup_date: pickupDate,
    });
    if (error) throw new Error(error.message);
  });

  const collection = await supabase.rpc("storefront_collection_for_pickup_date", {
    p_pickup_date: pickupDate,
  });
  const collectionId =
    collection.data && typeof collection.data === "object" && "id" in collection.data
      ? String((collection.data as { id: string }).id)
      : null;

  await timed("list_available_cakes_embed", async () => {
    if (!collectionId) return;
    const { error } = await supabase
      .from("collection_cakes")
      .select(
        `
      sort_order,
      library_cakes (
        id, name, status, description,
        library_cake_sizes ( id, label, price, preorder_days ),
        library_cake_photos ( id, image_url, sort_order )
      )
    `,
      )
      .eq("collection_id", collectionId)
      .eq("available", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
  });

  await timed("operating_hours_weekly", async () => {
    const { error } = await supabase
      .from("operating_hours_weekly")
      .select(
        "capability, weekday, enabled, opens_at, closes_at, latest_bookable, usual_start, usual_end",
      );
    if (error) throw new Error(error.message);
  });

  await timed("operating_hours_overrides", async () => {
    const { error } = await supabase
      .from("operating_hours_date_overrides")
      .select(
        "override_date, capability, enabled, opens_at, closes_at, latest_bookable, usual_start, usual_end, note",
      )
      .order("override_date");
    if (error) throw new Error(error.message);
  });

  await timed("collections_active_all", async () => {
    const { error } = await supabase
      .from("collections")
      .select("id, month, purpose, status, start_date, end_date, website_override")
      .eq("status", "active");
    if (error) throw new Error(error.message);
  });

  await timed("collections_special_override", async () => {
    const { error } = await supabase
      .from("collections")
      .select(
        "id, name, start_date, end_date, purpose, status, website_override, display_order",
      )
      .eq("status", "active")
      .eq("purpose", "special")
      .eq("website_override", true);
    if (error) throw new Error(error.message);
  });

  await timed("memberships_collection_cakes", async () => {
    if (!cakeId) return;
    const { data: catalogues, error: catalogueError } = await supabase
      .from("collections")
      .select("id")
      .eq("status", "active");
    if (catalogueError) throw new Error(catalogueError.message);
    const { error } = await supabase
      .from("collection_cakes")
      .select("collection_id, library_cake_id")
      .eq("available", true)
      .in("library_cake_id", [cakeId])
      .in(
        "collection_id",
        (catalogues ?? []).map((row) => row.id),
      );
    if (error) throw new Error(error.message);
  });

  await timed("list_closed_pickup_order_dates", async () => {
    const { error } = await supabase.rpc("list_closed_pickup_order_dates", {
      p_from: "2026-09-26",
      p_to: "2026-10-31",
    });
    if (error) throw new Error(error.message);
  });

  await timed("dine_in_venue_assets", async () => {
    const { error } = await supabase.from("dine_in_venue_assets").select("venue, asset_id");
    if (error) throw new Error(error.message);
  });

  await timed("storefront_customer_preorder_options", async () => {
    if (!collectionId) return;
    const { error } = await supabase.rpc("storefront_customer_preorder_options", {
      p_collection_id: collectionId,
    });
    if (error) throw new Error(error.message);
  });

  await timed("list_public_catalogue_vouchers", async () => {
    const { error } = await supabase.rpc("list_public_catalogue_vouchers");
    if (error) throw new Error(error.message);
  });

  console.log("--- parallel first wave (proposed) ---");
  const waveStarted = performance.now();
  await Promise.all([
    supabase.rpc("storefront_collection_for_pickup_date", {
      p_pickup_date: pickupDate,
    }),
    supabase
      .from("operating_hours_weekly")
      .select(
        "capability, weekday, enabled, opens_at, closes_at, latest_bookable, usual_start, usual_end",
      ),
    supabase
      .from("operating_hours_date_overrides")
      .select(
        "override_date, capability, enabled, opens_at, closes_at, latest_bookable, usual_start, usual_end, note",
      ),
    supabase
      .from("collections")
      .select("id, month, purpose, status, start_date, end_date, website_override")
      .eq("status", "active"),
    supabase
      .from("collections")
      .select(
        "id, name, start_date, end_date, purpose, status, website_override, display_order",
      )
      .eq("status", "active")
      .eq("purpose", "special")
      .eq("website_override", true),
    supabase.from("dine_in_venue_assets").select("venue, asset_id"),
    supabase.rpc("list_closed_pickup_order_dates", {
      p_from: "2026-09-26",
      p_to: "2026-10-31",
    }),
  ]);
  console.log(`${"parallel_first_wave".padEnd(42)} ${String(ms(waveStarted)).padStart(5)} ms`);

  if (collectionId) {
    await timed("list_available_cakes_slim_no_photos", async () => {
      const { error } = await supabase
        .from("collection_cakes")
        .select(
          `
        sort_order,
        library_cakes (
          id, name, status,
          library_cake_sizes ( id, cake_id, label, price, sort_order, preorder_days )
        )
      `,
        )
        .eq("collection_id", collectionId)
        .eq("available", true)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
    });
    const cakesStarted = performance.now();
    await Promise.all([
      supabase
        .from("collection_cakes")
        .select(
          `
        sort_order,
        library_cakes (
          id, name, status,
          library_cake_sizes ( id, cake_id, label, price, sort_order, preorder_days )
        )
      `,
        )
        .eq("collection_id", collectionId)
        .eq("available", true),
      supabase.rpc("storefront_customer_preorder_options", {
        p_collection_id: collectionId,
      }),
    ]);
    console.log(
      `${"parallel_slim_cakes+options".padEnd(42)} ${String(ms(cakesStarted)).padStart(5)} ms`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
