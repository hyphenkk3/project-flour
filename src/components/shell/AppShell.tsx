import type { ReactNode } from "react";
import type { WorkspaceNavItem } from "@/foundation/navigation/workspaces";
import type { StaffProfile } from "@/types/staff";
import { MobileNavigation } from "@/components/shell/MobileNavigation";
import { PageContainer } from "@/components/shell/PageContainer";
import { SidebarNavigation } from "@/components/shell/SidebarNavigation";
import { TopHeader } from "@/components/shell/TopHeader";
import { UserMenu } from "@/components/shell/UserMenu";

type AppShellProps = {
  staff: StaffProfile;
  navigation: WorkspaceNavItem[];
  currentPath: string;
  title?: string;
  children: ReactNode;
};

export function AppShell({
  staff,
  navigation,
  currentPath,
  title = "Home",
  children,
}: AppShellProps) {
  return (
    <div className="bg-mist text-ink min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl">
        <aside className="border-fog bg-mist sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r md:flex lg:w-72">
          <div className="border-fog border-b px-5 py-5">
            <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
              Whitebird
            </p>
            <p className="font-display text-ink mt-1 text-xl tracking-tight">
              Operating System
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SidebarNavigation currentPath={currentPath} items={navigation} />
          </div>
          <div className="border-fog border-t p-3">
            <UserMenu staff={staff} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopHeader staff={staff} title={title} />
          <main className="flex-1">
            <PageContainer>{children}</PageContainer>
          </main>
        </div>
      </div>

      <MobileNavigation currentPath={currentPath} items={navigation} />
    </div>
  );
}
