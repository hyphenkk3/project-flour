import { redirect } from "next/navigation";

type LegacyCounterVerifyRedirectProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LegacyCounterVerifyRedirect({
  params,
  searchParams,
}: LegacyCounterVerifyRedirectProps) {
  const { id } = await params;
  const search = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") {
      query.set(key, value);
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  redirect(`/preview/collection/orders/${id}/verify${suffix}`);
}
