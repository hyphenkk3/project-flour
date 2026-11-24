import Link from "next/link";

type SessionCheckPageProps = {
  searchParams: Promise<{ retry?: string }>;
};

export default async function SessionCheckPage({
  searchParams,
}: SessionCheckPageProps) {
  const params = await searchParams;
  const retryHref =
    params.retry === "pwa-launch"
      ? "/?pwaLaunch=1"
      : params.retry === "login"
        ? "/login"
        : "/home";
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">
        We couldn’t verify your session
      </h1>
      <p>
        Your sign-in has not been cleared. This can happen while the connection
        is waking up. Try the staff workspace again in a moment.
      </p>
      <Link
        className="rounded-full bg-[var(--color-primary)] px-5 py-3 font-semibold text-white"
        href={retryHref}
      >
        Retry staff workspace
      </Link>
      <Link className="underline" href="/login">
        Sign in instead
      </Link>
    </main>
  );
}
