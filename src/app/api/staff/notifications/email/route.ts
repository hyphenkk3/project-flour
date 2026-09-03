import { NextResponse } from "next/server";

/**
 * Email is sent by the server-side dispatch path.
 * The browser must not trigger notification emails.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Staff notification email is sent server-side and cannot be triggered from the browser.",
    },
    { status: 403 },
  );
}
