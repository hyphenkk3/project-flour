import Link from "next/link";
import { StorefrontTheme } from "@/workspaces/storefront/StorefrontTheme";

export const storefrontKickerClass =
  "text-signal text-[11px] font-medium tracking-[0.22em] uppercase";

export function StorefrontHomeLink() {
  return (
    <>
      <StorefrontTheme />
      <Link
        className="text-skyline hover:text-ink text-sm font-medium transition-colors duration-200"
        href="/"
      >
        ← Whitebird
      </Link>
    </>
  );
}

export function StorefrontStaffSignIn() {
  return (
    <p className="text-skyline mt-12 text-center text-sm">
      Staff?{" "}
      <Link
        className="text-ink decoration-fog underline underline-offset-4 transition-colors duration-200 hover:text-skyline"
        href="/login"
      >
        Sign in
      </Link>
    </p>
  );
}
