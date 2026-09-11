import Link from "next/link";
import { redirect } from "next/navigation";
import { StaffAdminCreateForm } from "@/components/settings/StaffAdminCreateForm";
import { StaffAdminDirectory } from "@/components/settings/StaffAdminDirectory";
import { requireStaff } from "@/foundation/auth/session";
import { canManageStaff } from "@/foundation/navigation/access";
import {
  listStaffProfilesForAdmin,
  listStaffRoles,
} from "@/foundation/staff/queries";

export const dynamic = "force-dynamic";

export default async function StaffAdminPage() {
  const actor = await requireStaff();
  if (!canManageStaff(actor.role.code)) {
    redirect("/settings");
  }

  const [staff, roles] = await Promise.all([
    listStaffProfilesForAdmin(),
    listStaffRoles(),
  ]);

  return (
    <main className="space-y-6">
      <div>
        <Link
          className="text-skyline hover:text-ink text-xs font-medium"
          href="/settings"
        >
          Back to Settings
        </Link>
        <p className="text-signal mt-3 text-[11px] font-medium tracking-[0.18em] uppercase">
          Account
        </p>
        <h2 className="text-ink mt-1 text-2xl font-semibold">Staff Management</h2>
        <p className="text-skyline mt-1 text-sm">
          Create and manage Whitebird staff accounts.
        </p>
      </div>

      <StaffAdminCreateForm
        actorIsMasterOwner={actor.isMasterOwner}
        roles={roles}
      />
      <StaffAdminDirectory
        actorIsMasterOwner={actor.isMasterOwner}
        actorStaffId={actor.id}
        roles={roles}
        staff={staff}
      />
    </main>
  );
}
