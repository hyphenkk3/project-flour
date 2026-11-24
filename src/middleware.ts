import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { AUTH_FETCH_TIMEOUT_MS } from "@/lib/supabase/fetch-timeout";
import { classifySessionVerification } from "@/foundation/auth/session-errors";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/browse",
  "/offers",
  "/extra",
  "/faq",
  "/order",
  "/order/success",
  "/auth/callback",
  "/auth/session-check",
  "/auth/session-resume",
]);

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/browse/") ||
    pathname.startsWith("/cakes/") ||
    pathname.startsWith("/order/") ||
    pathname.startsWith("/extra/") ||
    pathname.startsWith("/preview")
  );
}

function isMachineDispatchPath(pathname: string) {
  // Skip staff-session middleware only. Bearer auth is enforced by the route.
  return pathname === "/api/staff/notifications/dispatch";
}

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(({ name }) => /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(name));
}

function devAuthDiagnostic(
  event: string,
  details: Record<string, string | boolean>,
) {
  if (
    process.env.VERCEL_ENV === "preview" ||
    (process.env.VERCEL_ENV !== "production" &&
      process.env.NODE_ENV === "development")
  ) {
    console.info(
      "[pwa-auth-diagnostic]",
      JSON.stringify({ event, ...details }),
    );
  }
}

function staffLoginRedirect(request: NextRequest): NextResponse {
  const loginUrl = request.nextUrl.clone();
  const returnPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.hash = "";
  if (
    returnPath.startsWith("/") &&
    !returnPath.startsWith("//") &&
    returnPath !== "/login" &&
    !returnPath.startsWith("/login?")
  ) {
    loginUrl.searchParams.set("next", returnPath);
  }
  return NextResponse.redirect(loginUrl);
}

function sessionVerificationUnavailable(request: NextRequest): NextResponse {
  const retryPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const escapedRetryPath = retryPath.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

  return new NextResponse(
    `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Staff session check</title><body><main><h1>We couldn’t verify your session</h1><p>Your sign-in has not been cleared. Please retry when the connection is ready.</p><form method="get" action="${escapedRetryPath}"><button type="submit">Try again</button></form></main></body></html>`,
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
        "Retry-After": "3",
      },
    },
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/" &&
    request.nextUrl.searchParams.get("pwaLaunch") === "1"
  ) {
    devAuthDiagnostic("launch-marker", {
      launch_context: "manifest_start_url",
      auth_cookie_present: hasSupabaseAuthCookie(request),
      decision: "route_to_session_resume",
    });
    return NextResponse.rewrite(
      new URL("/auth/session-resume?from=pwa", request.url),
    );
  }

  if (
    pathname === "/login" &&
    request.nextUrl.searchParams.get("resumeChecked") !== "1"
  ) {
    const authCookiePresent = hasSupabaseAuthCookie(request);
    if (authCookiePresent) {
      devAuthDiagnostic("login-entry", {
        launch_context: "normal_login_route",
        auth_cookie_present: true,
        decision: "route_to_session_resume",
      });
      const resumeUrl = new URL("/auth/session-resume", request.url);
      resumeUrl.searchParams.set("from", "login");
      const next = request.nextUrl.searchParams.get("next");
      if (next) resumeUrl.searchParams.set("next", next);
      return NextResponse.rewrite(resumeUrl);
    }
    devAuthDiagnostic("login-entry", {
      launch_context: "normal_login_route",
      auth_cookie_present: false,
      decision: "show_login",
    });
    return NextResponse.next();
  }

  // Public routes must never wait on Supabase.
  if (isPublicPath(pathname) || isMachineDispatchPath(pathname)) {
    return NextResponse.next();
  }

  try {
    const { user, error, supabaseResponse } = await updateSession(
      request,
      AUTH_FETCH_TIMEOUT_MS,
    );

    const verification = classifySessionVerification(Boolean(user), error);
    if (verification === "temporarily_unavailable") {
      return sessionVerificationUnavailable(request);
    }

    if (verification === "signed_out") {
      return staffLoginRedirect(request);
    }

    return supabaseResponse;
  } catch {
    // A failed verification is not proof that the stored session is invalid.
    // Fail closed without clearing the cookie or misrouting to Login.
    return sessionVerificationUnavailable(request);
  }
}

export const config = {
  matcher: [
    /*
     * Skip Next internals, favicon, and static assets.
     * Only application routes hit this middleware.
     */
    "/((?!_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff|woff2)$).*)",
  ],
};
