import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="relative flex min-h-dvh flex-col justify-end overflow-hidden px-6 pb-16 pt-24 sm:px-10 sm:pb-24 sm:pt-28">
      <div
        aria-hidden
        className="animate-fade-in pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_12%_8%,#ffffff_0%,transparent_42%),radial-gradient(ellipse_at_88%_70%,#c9d6e2_0%,transparent_48%),linear-gradient(160deg,#eef2f5_0%,#e3ebf1_52%,#d5e1ea_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[-10%] h-[28rem] w-[28rem] rounded-full bg-signal/10 blur-3xl motion-safe:animate-drift"
      />

      <div className="relative mx-auto w-full max-w-3xl motion-safe:animate-rise">
        <h1 className="font-display text-5xl leading-[0.95] tracking-tight text-ink sm:text-7xl">
          Whitebird Operating System
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-skyline sm:text-xl">
          The operational platform for Whitebird Cake House.
        </p>
        <Link
          className="mt-10 inline-flex rounded-md bg-ink px-5 py-3 text-sm font-medium text-mist transition hover:bg-skyline"
          href="/login"
        >
          Staff login
        </Link>
      </div>
    </main>
  );
}
