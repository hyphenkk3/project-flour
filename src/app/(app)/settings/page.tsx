import { requireStaff } from "@/foundation/auth/session";
import { canManageStaff } from "@/foundation/navigation/access";
import { getNotificationDefinitionsForRole } from "@/foundation/staff/notification-preferences";
import { loadStaffNotificationPreferences } from "@/foundation/staff/notification-preferences-queries";
import { NotificationPreferences } from "@/components/settings/NotificationPreferences";

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

          <div>
            <p className="text-skyline text-xs">Username</p>
            <p className="text-ink mt-1 text-sm font-medium">
              {staff.username}
            </p>
          </div>

          <div>
            <p className="text-skyline text-xs">Email</p>
            <p className="text-ink mt-1 text-sm font-medium">
              {staff.email ?? "Not set"}
            </p>
          </div>

          <div>
            <p className="text-skyline text-xs">Role</p>
            <p className="text-ink mt-1 text-sm font-medium">
              {staff.role.name}
            </p>
          </div>
        </div>
      </section>

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

          <div className="border-fog bg-mist mt-4 rounded-lg border p-4">
            <p className="text-ink text-sm font-medium">Staff accounts</p>
            <p className="text-skyline mt-1 text-xs">
              Staff creation, role assignment, and account management will be
              available here.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
