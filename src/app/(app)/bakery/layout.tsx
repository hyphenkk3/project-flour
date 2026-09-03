import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessBakeryWorkspace } from "@/engines/bakery/capabilities";
import { canViewOrderAvailability } from "@/foundation/navigation/access";

export const dynamic = "force-dynamic";

export default async function BakeryLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const staff = await requireStaff();

  if (
    !canAccessBakeryWorkspace(staff.role.code) &&
    !canViewOrderAvailability(staff.role.code)
  ) {
    redirect("/home");
  }

  return (
    <div>
      <div className="mb-2 px-5 pt-4 sm:px-8">
        <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
          Bakery
        </p>
        <p className="text-skyline mt-1 text-sm">
          Preorder production and Bakery-confirmed EXTRA stock. Owner still
          handles payment and preorder handoff lifecycle.
        </p>
      </div>
      {children}
    </div>
  );
}
