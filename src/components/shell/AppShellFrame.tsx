"use client";

import { usePathname } from "next/navigation";

import { useSyncExternalStore, type ReactNode } from "react";

import {
  getWorkspaceTitleForPathname,
  type WorkspaceNavItem,
} from "@/foundation/navigation/workspaces";
import type { StaffProfile } from "@/types/staff";

import { AppShell } from "@/components/shell/AppShell";
import { StaffNotificationListener } from "@/components/shell/StaffNotificationListener";
import { ToastProvider } from "@/components/ui/Toast";
import { StaffNotificationRecoveryDiagnostics } from "@/components/shell/StaffNotificationRecoveryDiagnostics";

import type { StaffNotificationPreference } from "@/foundation/staff/notification-preferences";

function subscribeToHostnameChanges(): () => void {
  return () => {};
}

function getServerHostnameMatch(): boolean {
  return false;
}

type AppShellFrameProps = {
  staff: StaffProfile;
  navigation: WorkspaceNavItem[];
  notificationPreferences: StaffNotificationPreference[];
  recoveryDiagnosticsEnabled: boolean;
  recoveryDiagnosticsHostname: string;
  title?: string;
  children: ReactNode;
};

export function AppShellFrame({
  staff,
  navigation,
  notificationPreferences,
  recoveryDiagnosticsEnabled,
  recoveryDiagnosticsHostname,
  title,
  children,
}: AppShellFrameProps) {
  const pathname = usePathname();
  const expectedHostnameIsActive = useSyncExternalStore(
    subscribeToHostnameChanges,
    () => window.location.hostname === recoveryDiagnosticsHostname,
    getServerHostnameMatch,
  );
  const activeDiagnostics =
    recoveryDiagnosticsEnabled && expectedHostnameIsActive;

  return (
    <ToastProvider diagnosticsEnabled={activeDiagnostics}>
      <StaffNotificationListener
        staffId={staff.id}
        notificationPreferences={notificationPreferences}
        diagnosticsEnabled={activeDiagnostics}
      />
      {staff.isMasterOwner ? (
        <StaffNotificationRecoveryDiagnostics
          enabled={activeDiagnostics}
          expectedHostname={recoveryDiagnosticsHostname}
        />
      ) : null}

      <AppShell
        currentPath={pathname}
        navigation={navigation}
        staff={staff}
        title={title ?? getWorkspaceTitleForPathname(pathname) ?? "Staff"}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
