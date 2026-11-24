import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  decideSessionResume,
  type SessionAuthOutcome,
  type SessionProfileOutcome,
  type SessionResumeSource,
} from "@/foundation/auth/pwa-session-routing";
import { getSessionStaff } from "@/foundation/auth/session";
import { StaffSessionVerificationUnavailable } from "@/foundation/auth/session-errors";
import {
  resolvePostLoginDestination,
  sanitizePostLoginPath,
} from "@/foundation/auth/post-login-destination";
import { STAFF_FORCED_PASSWORD_CHANGE_PATH } from "@/foundation/staff/forced-password-change";

function devDiagnosticsEnabled(): boolean {
  let supabaseProjectIsDev = false;
  try {
    supabaseProjectIsDev =
      new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname ===
      "tzwtpxdcggesgjaqxkqr.supabase.co";
  } catch {
    supabaseProjectIsDev = false;
  }

  return (
    supabaseProjectIsDev &&
    (process.env.VERCEL_ENV === "preview" ||
      (process.env.VERCEL_ENV !== "production" &&
        process.env.NODE_ENV === "development"))
  );
}

function hasAuthCookie(cookieNames: string[]): boolean {
  return cookieNames.some((name) =>
    /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(name),
  );
}

function privateRedirect(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const source: SessionResumeSource = from === "login" ? "login" : "pwa";
  const next = sanitizePostLoginPath(request.nextUrl.searchParams.get("next"));
  const cookieStore = await cookies();
  const authCookiePresent = hasAuthCookie(
    cookieStore.getAll().map(({ name }) => name),
  );

  let auth: SessionAuthOutcome = "not_checked";
  let profile: SessionProfileOutcome = "not_checked";
  let refreshOutcome:
    | "refreshed"
    | "not_needed_or_not_observed"
    | "temporarily_unavailable"
    | "rejected"
    | "not_observed"
    | "not_attempted" = authCookiePresent ? "not_observed" : "not_attempted";
  let cookieMutation: "written" | "cleared" | "none" = "none";

  if (authCookiePresent) {
    try {
      const staff = await getSessionStaff({
        onAuthVerification: (outcome) => {
          auth = outcome;
          if (outcome === "verified" && refreshOutcome === "not_observed") {
            refreshOutcome = "not_needed_or_not_observed";
          } else if (outcome === "rejected") {
            refreshOutcome = "rejected";
          } else if (outcome === "temporarily_unavailable") {
            refreshOutcome = "temporarily_unavailable";
          }
        },
        onProfileVerification: (outcome) => {
          profile = outcome;
        },
        onAuthCookieMutation: (kind) => {
          cookieMutation = kind;
        },
        onSessionRefresh: (outcome) => {
          refreshOutcome = outcome;
        },
      });

      if (staff) {
        const decision = decideSessionResume({
          source,
          authCookiePresent,
          auth,
          profile,
        });
        if (devDiagnosticsEnabled()) {
          console.info(
            "[pwa-auth-diagnostic]",
            JSON.stringify({
              launch_context:
                source === "pwa" ? "manifest_start_url_marker" : "login_route",
              auth_cookie_present: authCookiePresent,
              auth_verification: auth,
              session_refresh: refreshOutcome,
              cookie_mutation: cookieMutation,
              staff_profile: profile,
              decision,
            }),
          );
        }
        return privateRedirect(
          request,
          staff.mustChangePassword
            ? STAFF_FORCED_PASSWORD_CHANGE_PATH
            : resolvePostLoginDestination(staff.role.code, next),
        );
      }
    } catch (error) {
      if (error instanceof StaffSessionVerificationUnavailable) {
        auth = "temporarily_unavailable";
        refreshOutcome = "temporarily_unavailable";
      } else {
        profile = "unavailable";
      }
    }
  } else {
    auth = "signed_out";
  }

  const decision = decideSessionResume({
    source,
    authCookiePresent,
    auth,
    profile,
  });
  if (devDiagnosticsEnabled()) {
    console.info(
      "[pwa-auth-diagnostic]",
      JSON.stringify({
        launch_context:
          source === "pwa" ? "manifest_start_url_marker" : "login_route",
        auth_cookie_present: authCookiePresent,
        auth_verification: auth,
        session_refresh: refreshOutcome,
        cookie_mutation: cookieMutation,
        staff_profile: profile,
        decision,
      }),
    );
  }

  if (decision === "retry") {
    return privateRedirect(
      request,
      source === "pwa"
        ? "/auth/session-check?retry=pwa-launch"
        : "/auth/session-check?retry=login",
    );
  }

  if (decision === "login") {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("resumeChecked", "1");
    if (next) loginUrl.searchParams.set("next", next);
    return privateRedirect(request, `${loginUrl.pathname}${loginUrl.search}`);
  }

  return privateRedirect(request, "/");
}
