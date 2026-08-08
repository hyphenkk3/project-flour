import { notFound } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { PaymentRequestPreview } from "@/workspaces/owner/orders/PaymentRequestPreview";
import { getGuestOrderById } from "@/workspaces/owner/orders/queries";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function PaymentRequestPage({
  params,
  searchParams,
}: PageProps) {
  const staff = await requireStaff();
  if (staff.role.code !== "owner") {
    notFound();
  }

  const { id } = await params;
  const query = await searchParams;
  const order = await getGuestOrderById(id);
  if (!order) {
    notFound();
  }

  if (order.status !== "awaiting_payment") {
    notFound();
  }
  if (order.settlement.remainingBalance <= 0) {
    notFound();
  }

  return <PaymentRequestPreview order={order} returnTo={query.returnTo} />;
}
