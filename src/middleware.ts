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
