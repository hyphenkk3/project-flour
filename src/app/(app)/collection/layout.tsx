import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessCollectionWorkspace } from "@/engines/collection/capabilities";

export const dynamic = "force-dynamic";

export default async function CollectionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const staff = await requireStaff();

  if (!canAccessCollectionWorkspace(staff.role.code)) {
    redirect("/home");
  }

  return (
    <div>
      <div className="mb-1 px-5 pt-3 sm:px-8">
        <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
          Collection
        </p>
        <p className="text-skyline mt-0.5 text-sm leading-snug">
          Pickup Ready, dine-in reservations, completed handoffs, and history.
        </p>
      </div>
      {children}
    </div>
  );
}
