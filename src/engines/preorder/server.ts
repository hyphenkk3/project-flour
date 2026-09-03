import { malaysiaPreorderBusinessDate } from "@/engines/preorder/business-date";
import { readPreorderDays } from "@/engines/preorder/lead";
import type { Ymd } from "@/engines/preorder/types";
import { createClient } from "@/lib/supabase/server";

type StorefrontClient = Awaited<ReturnType<typeof createClient>>;

function asYmd(value: unknown): Ymd | null {
  const key = String(value ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

/**
 * Authoritative DAY 0 from Postgres when available.
 * Falls back to the matching TypeScript Malaysia clock.
 */
export async function loadMalaysiaPreorderBusinessDate(
  supabase?: StorefrontClient,
  at: Date = new Date(),
): Promise<Ymd> {
  const client = supabase ?? (await createClient());
  try {
    const { data, error } = await client.rpc("malaysia_preorder_business_date");
    if (!error) {
      const ymd = asYmd(data);
      if (ymd) return ymd;
    }
  } catch {
    // Local/dev without the Phase 2 function still uses the TS clock.
  }
  return malaysiaPreorderBusinessDate(at);
}

export async function loadLivePreorderDaysBySizeId(
  sizeIds: readonly string[],
  supabase?: StorefrontClient,
): Promise<Map<string, number>> {
  const ids = [...new Set(sizeIds.map((id) => id.trim()).filter(Boolean))];
  const result = new Map<string, number>();
  if (ids.length === 0) return result;

  const client = supabase ?? (await createClient());
  const { data, error } = await client
    .from("library_cake_sizes")
    .select("id, preorder_days")
    .in("id", ids);
  if (error || !Array.isArray(data)) return result;

  for (const row of data) {
    const id = String((row as { id?: string }).id ?? "");
    if (!id) continue;
    result.set(
      id,
      readPreorderDays((row as { preorder_days?: unknown }).preorder_days),
    );
  }
  return result;
}
