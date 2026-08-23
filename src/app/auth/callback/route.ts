import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/settings?email_change=error", requestUrl.origin));
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/settings?email_change=error", requestUrl.origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.redirect(new URL("/settings?email_change=error", requestUrl.origin));
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
      new URL("/settings?email_change=profile_error", requestUrl.origin),
    );
  }

  return NextResponse.redirect(
    new URL("/settings?email_change=success", requestUrl.origin),
  );
}
