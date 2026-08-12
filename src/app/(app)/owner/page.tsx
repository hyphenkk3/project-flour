import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { OwnerDashboard } from "@/workspaces/owner/OwnerDashboard";

export const dynamic = "force-dynamic";

/** Operations Live Board remains Owner-only. */
export default async function OwnerPage() {
  const staff = await requireStaff();
  if (staff.role.code !== "owner") {
    redirect(
      staff.role.code === "customer_operations" ||
        staff.role.code === "manager"
        ? "/customer-operations/orders"
        : "/home",
    );
  }
  return <OwnerDashboard />;
}
