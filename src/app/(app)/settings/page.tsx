import Link from "next/link";
import { requireStaff } from "@/foundation/auth/session";
import { getNotificationDefinitionsForRole } from "@/foundation/staff/notification-preferences";
import { loadStaffNotificationPreferences } from "@/foundation/staff/notification-preferences-queries";
import { NotificationPreferences } from "@/components/settings/NotificationPreferences";
import { LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED } from "@/foundation/staff/legacy-staff-notification-email-pause";
import { StaffPasskeySettings } from "@/components/settings/StaffPasskeySettings";
import { StaffPasswordSettings } from "@/components/settings/StaffPasswordSettings";
import { StaffDisplayNameForm } from "@/components/settings/StaffDisplayNameForm";
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
          <div className="md:col-span-2">
            <StaffDisplayNameForm initialDisplayName={staff.displayName} />
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

      {(staff.role.code === "owner" || staff.role.code === "manager") && (
        <section className="border-fog rounded-xl border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-ink text-sm font-semibold">Customer Message Templates</h3>
              <p className="text-skyline mt-1 text-sm">
                Update customer-facing wording used by existing staff message workflows.
              </p>
            </div>
            <Link
              href="/settings/customer-message-templates"
              className="bg-ink rounded-lg px-4 py-2 text-sm font-semibold text-white"
            >
              Manage Templates
            </Link>
          </div>
        </section>
      )}

      <StaffPasskeySettings />

      <StaffPasswordSettings />

      <section className="border-fog rounded-xl border bg-white p-5">
        <h3 className="text-ink text-sm font-semibold">Notifications</h3>
        <p className="text-skyline mt-1 text-sm">
          {LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED
            ? "Email delivery is temporarily paused. Your saved email preferences are preserved. Web notifications remain available."
            : "Choose which operational updates you want to receive by email."}
        </p>

        <NotificationPreferences
          definitions={definitions}
          emailNotificationsPaused={LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED}
          initialPreferences={preferences}
        />
      </section>
    </main>
  );
}
