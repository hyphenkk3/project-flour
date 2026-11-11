import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { dispatchSpecificFreshPickReminderEvents } from "@/foundation/staff/fresh-pick-push-handoff";
import { dispatchFreshPickReminderPush } from "@/foundation/staff/staff-notification-push-dispatch";
import { createServiceClient } from "@/lib/supabase/admin";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DEV_SUPABASE_URL = "https://tzwtpxdcggesgjaqxkqr.supabase.co";
const NOTIFICATION_BRANCH = "codex/staff-notifications-dev-20261109";
// One event can fan out to up to ten eligible subscriptions, each with an
// eight-second provider timeout. Five sequential events therefore remain
// bounded below this route's 60-second platform limit with overhead reserved.
const MAX_EVENT_IDS_PER_RUN = 5;

function safeBearerMatch(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!expected || authorization.length > 1024) return false;
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return false;

  const supplied = Buffer.from(authorization.slice(prefix.length));
  const configured = Buffer.from(expected);
  return (
    supplied.length === configured.length &&
    timingSafeEqual(supplied, configured)
  );
}

function isExactDevPreview(): boolean {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== NOTIFICATION_BRANCH
  ) {
    return false;
  }

  try {
    const { url } = getSupabaseEnv();
    return url.trim().replace(/\/$/, "") === DEV_SUPABASE_URL;
  } catch {
    return false;
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(request: Request) {
  if (!safeBearerMatch(request)) {
    return json({ ok: false, outcome: "unauthorized" }, 401);
  }
  if (!isExactDevPreview()) {
    return json({ ok: false, outcome: "preview_scope_mismatch" }, 404);
  }

  try {
    const admin = createServiceClient();
    const { data: staleSuppressed, error: staleError } = await admin.rpc(
      "suppress_stale_fresh_pick_hold_reminder_push_deliveries",
    );
    if (staleError || typeof staleSuppressed !== "number") {
      console.error("[staff-fresh-pick-push] Stale suppression unavailable:", {
        code: staleError?.code ?? "invalid_result",
      });
      return json({ ok: false, outcome: "stale_suppression_unavailable" }, 503);
    }

    const { data, error } = await admin.rpc(
      "list_due_fresh_pick_hold_reminder_push_event_ids",
      { p_limit: MAX_EVENT_IDS_PER_RUN },
    );
    if (error || !Array.isArray(data)) {
      console.error("[staff-fresh-pick-push] Candidate query unavailable:", {
        code: error?.code ?? "invalid_result",
      });
      return json({ ok: false, outcome: "candidate_query_unavailable" }, 503);
    }

    const processed = await dispatchSpecificFreshPickReminderEvents({
      eventIds: data,
      dispatch: dispatchFreshPickReminderPush,
    });
    const results = processed.results;
    const result = {
      ok: true,
      attempted: processed.attempted,
      rejected: processed.rejected,
      staleSuppressed,
      queued: results.reduce((sum, result) => sum + result.queued, 0),
      sent: results.reduce((sum, result) => sum + result.sent, 0),
      failed: results.reduce((sum, result) => sum + result.failed, 0),
      suppressed: results.reduce((sum, result) => sum + result.suppressed, 0),
    };
    console.info("[staff-fresh-pick-push] Run complete:", result);
    return json(result);
  } catch {
    console.error("[staff-fresh-pick-push] Dispatch unavailable.");
    return json({ ok: false, outcome: "dispatch_unavailable" }, 503);
  }
}

export async function HEAD() {
  return new Response(null, {
    status: 405,
    headers: { Allow: "GET", "Cache-Control": "no-store, max-age=0" },
  });
}
