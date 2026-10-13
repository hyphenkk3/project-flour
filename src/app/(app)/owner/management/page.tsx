import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canManageStaff } from "@/foundation/navigation/access";

export const dynamic = "force-dynamic";

export default async function ManagementPage() {
  const staff = await requireStaff();
  if (!canManageStaff(staff.role.code)) redirect("/home");

  const cards = [
    ...(staff.role.code === "owner"
      ? [
          {
            title: "Financial",
            description: "Monthly reports, fulfilment sales, and comparisons.",
            href: "/owner/management/reports",
            action: "Open monthly reports",
          },
        ]
      : []),
    {
      title: "Staff",
      description:
        "Manage staff accounts and access using your existing permissions.",
      href: "/settings/staff",
      action: "Open staff management",
    },
  ];

  return (
    <main className="space-y-6">
      <header>
        <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
          Owner Workspace · Management
        </p>
        <h2 className="text-ink mt-1 text-2xl font-semibold">Management</h2>
        <p className="text-skyline mt-1 text-sm">
          Choose a management area available to your account.
        </p>
      </header>

      <section
        aria-label="Management areas"
        className="grid gap-4 sm:grid-cols-2"
      >
        {cards.map((card) => (
          <Link
            className="border-fog hover:border-signal/40 focus-visible:ring-signal rounded-xl border bg-white p-5 transition hover:shadow-sm focus-visible:ring-2 focus-visible:outline-none"
            href={card.href}
            key={card.href}
          >
            <h3 className="text-ink text-lg font-semibold">{card.title}</h3>
            <p className="text-skyline mt-2 text-sm">{card.description}</p>
            <span className="text-signal mt-5 inline-block text-sm font-semibold">
              {card.action} →
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
