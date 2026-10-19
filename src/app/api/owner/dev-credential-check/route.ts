import { requireStaff } from "@/foundation/auth/session";
import { createServiceClient } from "@/lib/supabase/admin";
import { getSupabaseEnv } from "@/lib/supabase/env";

const DEV_PROJECT_REF = "tzwtpxdcggesgjaqxkqr";
const DEV_PROJECT_URL = `https://${DEV_PROJECT_REF}.supabase.co`;
const RELEASE_BRANCH = "codex/wos-four-fix-release-20261019";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const staff = await requireStaff();
  if (staff.role.code !== "owner") {
    return Response.json(
      { ok: false, code: "owner_required" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const configuredUrl = getSupabaseEnv().url;
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== RELEASE_BRANCH ||
    configuredUrl !== DEV_PROJECT_URL
  ) {
    return Response.json(
      { ok: false, code: "preview_binding_mismatch" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const admin = createServiceClient();
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) {
      return Response.json(
        { ok: false, code: "credential_rejected" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      { ok: true, projectRef: DEV_PROJECT_REF },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, code: "verification_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
