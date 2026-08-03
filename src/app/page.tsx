import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="relative flex min-h-dvh flex-col justify-end overflow-hidden px-6 pt-24 pb-16 sm:px-10 sm:pt-28 sm:pb-24">
      <div
        aria-hidden
        className="animate-fade-in pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_12%_8%,#ffffff_0%,transparent_42%),radial-gradient(ellipse_at_88%_70%,#c9d6e2_0%,transparent_48%),linear-gradient(160deg,#eef2f5_0%,#e3ebf1_52%,#d5e1ea_100%)]"
      />
      <div
        aria-hidden
        className="bg-signal/10 motion-safe:animate-drift pointer-events-none absolute -top-24 right-[-10%] h-[28rem] w-[28rem] rounded-full blur-3xl"
      />

      <div className="motion-safe:animate-rise relative mx-auto w-full max-w-3xl">
        <h1 className="font-display text-ink text-5xl leading-[0.95] tracking-tight sm:text-7xl">
          Whitebird Operating System
        </h1>
        <p className="text-skyline mt-6 max-w-xl text-lg leading-relaxed sm:text-xl">
          The operational platform for Whitebird Cake House.
        </p>
        <Link
          className="bg-ink text-mist hover:bg-skyline mt-10 inline-flex rounded-md px-5 py-3 text-sm font-medium transition"
          href="/login"
        >
          Staff login
        </Link>
      </div>
    </main>
  );
}
