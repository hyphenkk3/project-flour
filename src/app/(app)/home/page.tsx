import { requireStaff } from "@/foundation/auth/session";
import { getNavigationForRole } from "@/foundation/navigation/workspaces";
import { EmptyState } from "@/components/shell/EmptyState";
import { PageHeader } from "@/components/shell/PageHeader";
import { WorkspaceLink } from "@/components/shell/WorkspaceLink";

export const dynamic = "force-dynamic";

function formatToday(date: Date) {
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Singapore",
  }).format(date);
}

export default async function HomePage() {
  const staff = await requireStaff();
  const navigation = getNavigationForRole(staff.role.code);
  const today = formatToday(new Date());

  return (
    <div className="space-y-8">
      <div>
        <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
          Whitebird
        </p>
        <PageHeader
          description={`${staff.role.name} · ${today}`}
          title={`Hello, ${staff.displayName}`}
        />
      </div>

      <EmptyState title="Your Whitebird workspace is ready." />

      <section aria-labelledby="available-workspaces">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h3
            className="text-ink text-sm font-semibold tracking-wide"
            id="available-workspaces"
          >
            Your workspaces
          </h3>
          <p className="text-skyline text-xs">V0.1.1</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {navigation.map((item) => (
            <li
              className="border-fog rounded-xl border bg-white/80 p-1 shadow-sm"
              key={item.id}
            >
              <WorkspaceLink active={item.id === "home"} item={item} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
