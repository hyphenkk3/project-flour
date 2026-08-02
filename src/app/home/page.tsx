import { logoutAction } from "@/foundation/auth/actions";
import { requireStaff } from "@/foundation/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const staff = await requireStaff();

  return (
    <main className="relative flex min-h-dvh flex-col px-6 py-16 sm:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_12%_8%,#ffffff_0%,transparent_42%),linear-gradient(160deg,#eef2f5_0%,#e3ebf1_52%,#d5e1ea_100%)]"
      />
      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.22em] text-signal uppercase">
            Home
          </p>
          <h1 className="font-display mt-4 text-4xl tracking-tight text-ink sm:text-6xl">
            Whitebird Operating System
          </h1>
          <p className="mt-4 text-lg text-skyline">
            Signed in as {staff.displayName} ({staff.role.name})
          </p>
        </div>

        <form action={logoutAction}>
          <button
            className="rounded-md border border-fog bg-white px-4 py-2.5 text-sm font-medium text-ink transition hover:border-signal"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
