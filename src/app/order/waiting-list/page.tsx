import type { Metadata } from "next";
import { StorefrontWaitingListAckPage } from "@/workspaces/storefront/waiting-list/StorefrontWaitingListAckPage";

export const metadata: Metadata = {
  title: "Waiting list · Whitebird",
};

export const dynamic = "force-dynamic";

type WaitingListAckRouteProps = {
  searchParams: Promise<{ request?: string }>;
};

export default async function WaitingListAckRoute({
  searchParams,
}: WaitingListAckRouteProps) {
  const params = await searchParams;
  return <StorefrontWaitingListAckPage requestId={params.request} />;
}
