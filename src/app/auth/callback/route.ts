import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");

  if (!tokenHash || type !== "email_change") {
    return NextResponse.redirect(
      new URL("/settings?email_change=error", requestUrl.origin),
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email_change",
  });

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/settings?email_change=error&message=${encodeURIComponent(error.message)}`,
        requestUrl.origin,
      ),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.redirect(
      new URL("/settings?email_change=error", requestUrl.origin),
    );
  }

  const admin = createServiceClient();

  const { error: profileError } = await admin
    .from("staff_profiles")
    .update({
      email: user.email,
    })
    .eq("auth_user_id", user.id);

  if (profileError) {
    return NextResponse.redirect(
      new URL(
        `/settings?email_change=profile_error&message=${encodeURIComponent(
          profileError.message,
        )}`,
        requestUrl.origin,
      ),
    );
  }

  return NextResponse.redirect(
    new URL("/settings?email_change=success", requestUrl.origin),
  );
}
