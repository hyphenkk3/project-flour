import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessGuestOrderWorkspace } from "@/engines/orders/delivery-finance-capabilities";

export const dynamic = "force-dynamic";

/**
 * Owner route group hosts the guest Order Workspace (shared with Counter-like
 * roles in M4-P3 2B-1). Layout allows access; each page applies capability gates.
 */
export default async function OwnerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const staff = await requireStaff();
  if (!canAccessGuestOrderWorkspace(staff.role.code)) {
    redirect("/home");
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">{children}</div>
  );
}
