import Link from "next/link";

export function StorefrontHomeLink() {
  return (
    <Link
      className="text-skyline hover:text-ink text-sm font-medium"
      href="/"
    >
      ← Whitebird
    </Link>
  );
}

export function StorefrontStaffSignIn() {
  return (
    <p className="text-skyline mt-12 text-center text-sm">
      Staff?{" "}
      <Link className="text-signal font-medium underline" href="/login">
        Sign in
      </Link>
    </p>
  );
}
