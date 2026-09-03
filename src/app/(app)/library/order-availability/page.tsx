import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import {
  canMutateOrderAvailability,
  canViewOrderAvailability,
} from "@/foundation/navigation/access";
import { OrderAvailabilityScreen } from "@/workspaces/library/order-availability/OrderAvailabilityScreen";

export const dynamic = "force-dynamic";

type LibraryOrderAvailabilityPageProps = {
  searchParams: Promise<{ month?: string }>;
};

export default async function LibraryOrderAvailabilityPage({
  searchParams,
}: LibraryOrderAvailabilityPageProps) {
  const staff = await requireStaff();
  if (!canViewOrderAvailability(staff.role.code)) {
    redirect("/home");
  }

  const params = await searchParams;
  return (
    <OrderAvailabilityScreen
      canMutate={canMutateOrderAvailability(staff.role.code)}
      description="Close or reopen pickup dates for new customer preorders. This does not change catalogues or website override. Closing a date prevents new website preorders for that pickup date."
      hrefBase="/library/order-availability"
      monthParam={params.month}
      title="Order Availability"
    />
  );
}
