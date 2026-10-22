import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  GUEST_CHECKOUT_RECOVERY_MAX_AGE_SECONDS,
  guestCheckoutRecoveryCookieName,
  isCheckoutRecoveryToken,
  type CheckoutRecoveryFlow,
} from "@/workspaces/storefront/checkout/checkout-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const isHttps = forwardedProto === "https" || requestUrl.protocol === "https:";
  const requestOrigin = requestUrl.origin;
  if (request.headers.get("origin") !== requestOrigin) {
    return NextResponse.json({ error: "Checkout session unavailable." }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (
    !isHttps &&
    requestUrl.hostname !== "localhost" &&
    requestUrl.hostname !== "127.0.0.1"
  ) {
    return NextResponse.json({ error: "Secure checkout is required." }, {
      status: 426,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Checkout session unavailable." }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const flow =
    typeof body === "object" && body !== null && "flow" in body
      ? body.flow
      : null;
  if (flow !== "whole_cake" && flow !== "fresh_pick") {
    return NextResponse.json({ error: "Checkout session unavailable." }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const cookieName = guestCheckoutRecoveryCookieName(flow as CheckoutRecoveryFlow);
  // The preflight endpoint is under /api, so the capability must be sent to
  // both this handler and the later Server Action/receipt recovery routes.
  // Keep it HttpOnly and flow-specific; the path cannot be narrowed without
  // splitting this endpoint into separate flow routes.
  const cookiePath = "/";

  const store = await cookies();
  const existing = store.get(cookieName)?.value;
  if (existing && !isCheckoutRecoveryToken(existing)) {
    return NextResponse.json({ error: "Refresh checkout to continue." }, {
      status: 409,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!existing) {
    const token = randomBytes(32).toString("base64url");
    store.set({
      name: cookieName,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps,
      path: cookiePath,
      maxAge: GUEST_CHECKOUT_RECOVERY_MAX_AGE_SECONDS,
      priority: "high",
    });
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}
