"use client";

import { AVAILABILITY_WORKSPACE_SECTIONS } from "@/workspaces/library/order-availability/availability-sections";

const tabClass =
  "border-fog text-ink hover:border-skyline inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium";

export function AvailabilitySectionNav() {
  return (
    <nav
      aria-label="Availability sections"
      className="border-fog bg-mist/95 sticky top-16 z-20 -mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 py-2"
    >
      {AVAILABILITY_WORKSPACE_SECTIONS.map((section) => (
        <a className={tabClass} href={`#${section.id}`} key={section.id}>
          {section.label}
        </a>
      ))}
    </nav>
  );
}
