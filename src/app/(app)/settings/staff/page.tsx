import Link from "next/link";
import { redirect } from "next/navigation";
import { StaffAdminCreateForm } from "@/components/settings/StaffAdminCreateForm";
import { StaffAdminDirectory } from "@/components/settings/StaffAdminDirectory";
import { requireStaff } from "@/foundation/auth/session";
import { canManageStaff } from "@/foundation/navigation/access";
import { StaffCredentialActivity } from "@/components/settings/StaffCredentialActivity";
import { listStaffCredentialEventsForAdmin } from "@/foundation/staff/credential-audit";
import {
  listArchivedStaffProfilesForAdmin,
  listStaffProfilesForAdmin,
  listStaffRoles,
} from "@/foundation/staff/queries";

export const dynamic = "force-dynamic";

export default async function StaffAdminPage() {
  const actor = await requireStaff();
  if (!canManageStaff(actor.role.code)) {
    redirect("/settings");
  }

  const [staff, archivedStaff, roles, credentialEvents] = await Promise.all([
    listStaffProfilesForAdmin(),
    listArchivedStaffProfilesForAdmin(),
    listStaffRoles(),
    listStaffCredentialEventsForAdmin(),
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

      <StaffCredentialActivity events={credentialEvents} />

      <StaffAdminCreateForm
        actorIsMasterOwner={actor.isMasterOwner}
        roles={roles}
      />
      <StaffAdminDirectory
        actorIsMasterOwner={actor.isMasterOwner}
        actorRole={actor.role.code}
        actorStaffId={actor.id}
        roles={roles}
        staff={staff}
        archivedStaff={archivedStaff}
      />
    </main>
  );
}
