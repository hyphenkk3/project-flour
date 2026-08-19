import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { OperatingHoursBoard } from "@/workspaces/library/operating-hours/OperatingHoursBoard";
import { loadOperatingHoursSnapshot } from "@/workspaces/library/operating-hours/queries";

export const dynamic = "force-dynamic";

export default async function LibraryOperatingHoursPage() {
  let loadError: string | null = null;
  const snapshot = await loadOperatingHoursSnapshot().catch((error: unknown) => {
    loadError = error instanceof Error ? error.message : "Could not load operating hours.";
    return null;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        description="Weekly hours and special dates for cake pickup, delivery, dine-in booking, Hyphen, and Whitebird. Customer checkout, TypeScript availability, and SQL validation all read this schedule. Order availability still closes individual pickup dates for new website preorders."
        title="Operating hours"
      />
      {loadError || !snapshot ? (
        <EmptyState
          description={loadError ?? "Could not load operating hours."}
          title="Operating hours unavailable"
        />
      ) : (
        <OperatingHoursBoard snapshot={snapshot} />
      )}
    </div>
  );
}
