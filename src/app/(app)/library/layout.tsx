import { redirect } from "next/navigation";
import { LibraryNav } from "@/workspaces/library/LibraryNav";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessWorkspace } from "@/foundation/navigation/access";

export const dynamic = "force-dynamic";

export default async function LibraryLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const staff = await requireStaff();

  if (!canAccessWorkspace(staff.role.code, "library")) {
    redirect("/home");
  }

  return (
    <div>
      <div className="mb-2">
        <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
          Master Library
        </p>
        <p className="text-skyline mt-1 text-sm">
          Reusable business assets for future Studio. Not a Collection Builder.
        </p>
      </div>
      <LibraryNav />
      {children}
    </div>
  );
}
