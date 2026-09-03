import { cookies } from "next/headers";

export const GUEST_WAITING_LIST_COOKIE = "wb_guest_waiting_list";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export async function setGuestWaitingListCookie(requestId: string): Promise<void> {
  const store = await cookies();
  store.set({
    name: GUEST_WAITING_LIST_COOKIE,
    value: requestId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/order",
  });
}

export async function guestWaitingListCookieId(): Promise<string | null> {
  const store = await cookies();
  return store.get(GUEST_WAITING_LIST_COOKIE)?.value ?? null;
}
