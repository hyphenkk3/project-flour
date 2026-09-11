import Link from "next/link";
import { requireStaff } from "@/foundation/auth/session";
import { canManageStaff } from "@/foundation/navigation/access";
import { getNotificationDefinitionsForRole } from "@/foundation/staff/notification-preferences";
import { loadStaffNotificationPreferences } from "@/foundation/staff/notification-preferences-queries";
import { NotificationPreferences } from "@/components/settings/NotificationPreferences";
import { StaffPasskeySettings } from "@/components/settings/StaffPasskeySettings";
import { StaffPasswordSettings } from "@/components/settings/StaffPasswordSettings";
import { StaffProfileForm } from "@/components/settings/StaffProfileForm";
import { StaffUsernameForm } from "@/components/settings/StaffUsernameForm";

export default async function SettingsPage() {
  const staff = await requireStaff();

  const definitions = getNotificationDefinitionsForRole(staff.role.code);
  const preferences = await loadStaffNotificationPreferences(staff.id);

  return (
    <main className="space-y-6">
      <div>
        <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
          Account
        </p>
        <h2 className="text-ink mt-1 text-2xl font-semibold">Settings</h2>
        <p className="text-skyline mt-1 text-sm">
          Manage your profile, notifications, and preferences.
        </p>
      </div>

      <section className="border-fog rounded-xl border bg-white p-5">
        <div>
          <h3 className="text-ink text-sm font-semibold">Profile</h3>
          <p className="text-skyline mt-1 text-sm">
            Your Whitebird staff account.
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-skyline text-xs">Display name</p>
            <p className="text-ink mt-1 text-sm font-medium">
              {staff.displayName}
            </p>
          </div>

          <div className="md:col-span-2">
            <StaffUsernameForm initialUsername={staff.username} />
          </div>

          <div className="md:col-span-2">
            <StaffProfileForm initialEmail={staff.email ?? ""} />
          </div>

          <div>
            <p className="text-skyline text-xs">Role</p>
            <p className="text-ink mt-1 text-sm font-medium">
              {staff.role.name}
            </p>
          </div>
        </div>
      </section>

      <StaffPasskeySettings />

      <StaffPasswordSettings />

      <section className="border-fog rounded-xl border bg-white p-5">
        <h3 className="text-ink text-sm font-semibold">Notifications</h3>
        <p className="text-skyline mt-1 text-sm">
          Choose which operational updates you want to receive by email.
        </p>

        <NotificationPreferences
          definitions={definitions}
          initialPreferences={preferences}
        />
      </section>

      {canManageStaff(staff.role.code) && (
        <section className="border-fog rounded-xl border bg-white p-5">
          <h3 className="text-ink text-sm font-semibold">Staff Management</h3>
          <p className="text-skyline mt-1 text-sm">
            Manage Whitebird staff accounts and access.
          </p>

          <Link
            className="bg-signal mt-4 inline-flex rounded-lg px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            href="/settings/staff"
          >
            Open staff accounts
          </Link>
        </section>
      )}
    </main>
  );
}
