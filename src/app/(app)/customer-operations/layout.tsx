import { CustomerOperationsNav } from "@/workspaces/customer-operations/CustomerOperationsNav";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessWorkspace } from "@/foundation/navigation/access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CustomerOperationsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const staff = await requireStaff();

  if (!canAccessWorkspace(staff.role.code, "customer_operations")) {
    redirect("/home");
  }

  return (
    <div>
      <CustomerOperationsNav />
      {children}
    </div>
  );
}
