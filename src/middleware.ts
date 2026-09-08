import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { AUTH_FETCH_TIMEOUT_MS } from "@/lib/supabase/fetch-timeout";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/browse",
  "/extra",
  "/faq",
  "/order",
  "/order/success",
  "/auth/callback",
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes must never wait on Supabase.
  if (isPublicPath(pathname) || isMachineDispatchPath(pathname)) {
    return NextResponse.next();
  }

  try {
    const { user, supabaseResponse } = await updateSession(
      request,
      AUTH_FETCH_TIMEOUT_MS,
    );

    if (!user) {
      return staffLoginRedirect(request);
    }

    return supabaseResponse;
  } catch {
    // Timeout / network failure: fail closed to login, never hang.
    return staffLoginRedirect(request);
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
