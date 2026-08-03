import { logoutAction } from "@/foundation/auth/actions";
import type { StaffProfile } from "@/types/staff";

type UserMenuProps = {
  staff: StaffProfile;
  compact?: boolean;
};

export function UserMenu({ staff, compact = false }: UserMenuProps) {
  return (
    <div
      className={
        compact
          ? "flex items-center gap-3"
          : "border-fog flex flex-col gap-3 rounded-xl border bg-white p-3"
      }
    >
      <div className={compact ? "min-w-0 text-right" : "min-w-0"}>
        <p className="text-ink truncate text-sm font-medium">
          {staff.displayName}
        </p>
        <p className="text-skyline truncate text-xs">{staff.role.name}</p>
      </div>
      <form action={logoutAction}>
        <button
          className={
            compact
              ? "border-fog text-ink hover:border-signal rounded-lg border bg-white px-3 py-2 text-xs font-medium transition"
              : "border-fog bg-mist text-ink hover:border-signal w-full rounded-lg border px-3 py-2 text-sm font-medium transition"
          }
          type="submit"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
