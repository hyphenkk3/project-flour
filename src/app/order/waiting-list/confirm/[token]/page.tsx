import type { Metadata } from "next";
import { WaitingListConfirmationPage } from "@/workspaces/storefront/waiting-list/WaitingListConfirmationPage";

export const metadata: Metadata = {
  title: "Confirm waiting list · Whitebird",
};

export const dynamic = "force-dynamic";

type WaitingListConfirmRouteProps = {
  params: Promise<{ token: string }>;
};

export default async function WaitingListConfirmRoute({
  params,
}: WaitingListConfirmRouteProps) {
  const { token } = await params;
  return <WaitingListConfirmationPage token={token ?? ""} />;
}
