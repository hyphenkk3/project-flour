import type { StaffProfile } from "@/types/staff";
import { UserMenu } from "@/components/shell/UserMenu";

type TopHeaderProps = {
  staff: StaffProfile;
  title?: string;
};

export function TopHeader({ staff, title = "Home" }: TopHeaderProps) {
  return (
    <header className="border-fog bg-mist/90 sticky top-0 z-30 border-b backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="min-w-0">
          <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
            Whitebird
          </p>
          <h1 className="text-ink truncate text-base font-semibold md:text-lg">
            {title}
          </h1>
        </div>

        <div className="min-w-0 shrink-0">
          <UserMenu compact staff={staff} />
        </div>
      </div>
    </header>
  );
}
