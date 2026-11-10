import { NextResponse } from "next/server";

import { getSessionStaff } from "@/foundation/auth/session";
import {
  diagnosticEnvironmentAllowed,
  diagnosticOwnerAllowed,
  diagnosticSameOriginAllowed,
  verifyDevServiceRoleCredential,
} from "@/foundation/staff/dev-service-role-verification";

export const dynamic = "force-dynamic";

function resultResponse(result: "PASS" | "FAIL" | "HOLD", status: number) {
  return NextResponse.json(
    { result },
    {
      status,
      headers: {
        "Cache-Control": "no-store, private",
        Vary: "Cookie, Origin",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);

  if (
    !diagnosticEnvironmentAllowed({
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    })
  ) {
    return resultResponse("HOLD", 404);
  }

  if (
    !diagnosticSameOriginAllowed(
      request.headers.get("origin"),
      requestUrl.origin,
    )
  ) {
    return resultResponse("HOLD", 403);
  }

  const staff = await getSessionStaff();
  if (!diagnosticOwnerAllowed(staff)) {
    return resultResponse("HOLD", 403);
  }

  const result = await verifyDevServiceRoleCredential(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  return resultResponse(
    result,
    result === "PASS" ? 200 : result === "FAIL" ? 503 : 504,
  );
}
