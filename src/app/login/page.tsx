import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";
import { sanitizePostLoginPath } from "@/foundation/auth/post-login-destination";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff Login · Whitebird Operating System",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = sanitizePostLoginPath(params.next);

  return (
    <main className="relative flex min-h-dvh flex-col justify-center px-6 py-16 sm:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_12%_8%,#ffffff_0%,transparent_42%),linear-gradient(160deg,#eef2f5_0%,#e3ebf1_52%,#d5e1ea_100%)]"
      />
      <div className="relative mx-auto w-full max-w-md">
        <p className="text-signal text-xs font-medium tracking-[0.22em] uppercase">
          Whitebird Operating System
        </p>
        <h1 className="font-display text-ink mt-4 text-4xl tracking-tight sm:text-5xl">
          Staff login
        </h1>
        <p className="text-skyline mt-3">
          Sign in with your staff username and password.
        </p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
