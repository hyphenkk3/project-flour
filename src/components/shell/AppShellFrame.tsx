"use client";

import { usePathname } from "next/navigation";

import type { ReactNode } from "react";

import type { WorkspaceNavItem } from "@/foundation/navigation/workspaces";
import type { StaffProfile } from "@/types/staff";

import { AppShell } from "@/components/shell/AppShell";
import { StaffNotificationListener } from "@/components/shell/StaffNotificationListener";
import { ToastProvider } from "@/components/ui/Toast";

import type { StaffNotificationPreference } from "@/foundation/staff/notification-preferences";

type AppShellFrameProps = {
  staff: StaffProfile;
  navigation: WorkspaceNavItem[];
  notificationPreferences: StaffNotificationPreference[];
  title?: string;
  children: ReactNode;
};

function titleForPath(pathname: string): string {
  if (pathname.startsWith("/owner")) {
    return "Operations";
  }

  if (pathname.startsWith("/customer-operations")) {
    return "Customer Operations";
  }

  if (pathname.startsWith("/library")) {
    return "Library";
  }

  return "Home";
}

export function AppShellFrame({
  staff,
  navigation,
  notificationPreferences,
  title,
  children,
}: AppShellFrameProps) {
  const pathname = usePathname();

  return (
    <ToastProvider>
      <StaffNotificationListener
        notificationPreferences={notificationPreferences}
      />

      <AppShell
        currentPath={pathname}
        navigation={navigation}
        staff={staff}
        title={title ?? titleForPath(pathname)}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
