import { redirect } from "next/navigation";
import { LibraryNav } from "@/workspaces/library/LibraryNav";
import { requireStaff } from "@/foundation/auth/session";
import { canViewLibrary } from "@/foundation/navigation/access";

export const dynamic = "force-dynamic";

export default async function LibraryLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const staff = await requireStaff();

  if (!canViewLibrary(staff.role.code)) {
    redirect("/home");
  }

  return (
    <div>
      <div className="mb-2">
        <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
          Master Library
        </p>
        <p className="text-skyline mt-1 text-sm">
          Reusable cakes, catalogues, promotions, vouchers, and assets. Order
          availability closes pickup dates. Operating hours set weekly and
          special-date schedules. Pickup stays in the Pickup workspace.
        </p>
      </div>
      <LibraryNav />
      {children}
    </div>
  );
}
