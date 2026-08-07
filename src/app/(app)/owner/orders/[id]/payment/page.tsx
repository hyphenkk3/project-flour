import { notFound } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { PaymentRequestPreview } from "@/workspaces/owner/orders/PaymentRequestPreview";
import { getGuestOrderById } from "@/workspaces/owner/orders/queries";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PaymentRequestPage({ params }: PageProps) {
  const staff = await requireStaff();
  if (staff.role.code !== "owner") {
    notFound();
  }

  const { id } = await params;
  const order = await getGuestOrderById(id);
  if (!order) {
    notFound();
  }

  if (order.status !== "awaiting_payment") {
    notFound();
  }

  return (
    <PaymentRequestPreview order={order} />
  );
}
