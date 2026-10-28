import type { StaffProfile } from "@/types/staff";
import { UserMenu } from "@/components/shell/UserMenu";

type TopHeaderProps = {
  staff: StaffProfile;
  title?: string;
  compactHome?: boolean;
};

export function TopHeader({
  staff,
  title = "Home",
  compactHome = false,
}: TopHeaderProps) {
  return (
    <header className="border-fog bg-mist/90 sticky top-0 z-30 border-b backdrop-blur-md">
      <div
        className={`flex flex-col px-4 md:flex-row md:items-center md:justify-between md:gap-4 md:px-6 ${compactHome ? "gap-2 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 md:py-3" : "gap-3 py-3"}`}
      >
        <div className="min-w-0 shrink-0">
          <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
            Whitebird
          </p>
          <h1 className="text-ink truncate text-base font-semibold md:text-lg">
            {title}
          </h1>
        </div>

        <div className="w-full min-w-0 md:w-auto md:shrink-0">
          <UserMenu compact compactHome={compactHome} staff={staff} />
        </div>
      </div>
    </header>
  );
}
