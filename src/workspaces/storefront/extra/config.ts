import {
  DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
  parseFreshPicksPreparationConfig,
  type FreshPicksPreparationConfig,
} from "@/engines/extra/fresh-picks-preparation";
import { createPublicClient } from "@/lib/supabase/server";

export async function loadFreshPicksPreparationConfig(): Promise<FreshPicksPreparationConfig> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("fresh_picks_preparation_config");
    if (error || data == null) return DEFAULT_FRESH_PICKS_PREPARATION_CONFIG;
    const row = data as Record<string, unknown>;
    return parseFreshPicksPreparationConfig({
      cutoffTime: row.cutoffTime ?? row.cutoff_time,
      leadMinutes: row.leadMinutes ?? row.lead_minutes,
    });
  } catch {
    return DEFAULT_FRESH_PICKS_PREPARATION_CONFIG;
  }
}
