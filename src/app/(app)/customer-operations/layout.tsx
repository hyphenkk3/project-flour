import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessWorkspace } from "@/foundation/navigation/access";

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

  return children;
}
