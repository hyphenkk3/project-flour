import type { StaffProfile } from "@/types/staff";
import { UserMenu } from "@/components/shell/UserMenu";

type TopHeaderProps = {
  staff: StaffProfile;
  title?: string;
};

export function TopHeader({ staff, title = "Home" }: TopHeaderProps) {
  return (
    <header className="border-fog bg-mist/90 sticky top-0 z-30 border-b backdrop-blur-md">
      <div
        className="flex min-w-0 items-center justify-between gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 md:gap-4 md:px-6 md:py-3"
        data-testid="staff-header-row"
      >
        <div className="min-w-0 flex-1" data-testid="staff-brand-group">
          <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
            Whitebird
          </p>
          <h1 className="text-ink truncate text-sm font-semibold sm:text-base md:text-lg">
            {title}
          </h1>
        </div>

        <div className="min-w-0 shrink-0" data-testid="staff-account-group">
          <UserMenu compact staff={staff} />
        </div>
      </div>
    </header>
  );
}
