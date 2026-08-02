import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff Login · Whitebird Operating System",
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh flex-col justify-center px-6 py-16 sm:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_12%_8%,#ffffff_0%,transparent_42%),linear-gradient(160deg,#eef2f5_0%,#e3ebf1_52%,#d5e1ea_100%)]"
      />
      <div className="relative mx-auto w-full max-w-md">
        <p className="text-xs font-medium tracking-[0.22em] text-signal uppercase">
          Whitebird Operating System
        </p>
        <h1 className="font-display mt-4 text-4xl tracking-tight text-ink sm:text-5xl">
          Staff login
        </h1>
        <p className="mt-3 text-skyline">
          Sign in with your staff username and password.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
