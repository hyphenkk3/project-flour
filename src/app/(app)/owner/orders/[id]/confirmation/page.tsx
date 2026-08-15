import { notFound } from "next/navigation";
import { canAccessCustomerConfirmation } from "@/engines/orders/confirmation-validity";
import { buildGuestOrderWorkspaceCapabilities } from "@/engines/orders/delivery-finance-capabilities";
import { requireStaff } from "@/foundation/auth/session";
import { ConfirmationPreview } from "@/workspaces/owner/orders/ConfirmationPreview";
import { getGuestOrderById } from "@/workspaces/owner/orders/queries";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string; returnTo?: string }>;
};

export default async function ConfirmationPage({
  params,
  searchParams,
}: PageProps) {
  const staff = await requireStaff();
  const capabilities = buildGuestOrderWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!capabilities.canPrepareConfirmation) {
    notFound();
  }

  const { id } = await params;
  const query = await searchParams;
  const order = await getGuestOrderById(id);
  if (!order) {
    notFound();
  }

  if (
    !canAccessCustomerConfirmation({
      status: order.status,
      confirmationNeedsResend: order.confirmationNeedsResend,
    })
  ) {
    notFound();
  }

  const isUpdated =
    order.confirmationNeedsResend ||
    order.status === "pending_confirmation" ||
    query.updated === "1";

  return (
    <ConfirmationPreview
      isUpdated={isUpdated}
      order={order}
      returnTo={query.returnTo}
      staffDisplayName={staff.displayName}
    />
  );
}
