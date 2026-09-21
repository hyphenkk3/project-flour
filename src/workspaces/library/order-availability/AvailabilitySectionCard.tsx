import type { ReactNode } from "react";
import { PagePanel } from "@/components/ui";
import { AVAILABILITY_SECTION_SCROLL_MARGIN_CLASS } from "@/workspaces/library/order-availability/availability-sections";

type AvailabilitySectionCardProps = {
  id: string;
  title: string;
  children: ReactNode;
};

export function AvailabilitySectionCard({
  id,
  title,
  children,
}: AvailabilitySectionCardProps) {
  return (
    <section
      aria-labelledby={id}
      className={AVAILABILITY_SECTION_SCROLL_MARGIN_CLASS}
      id={id}
    >
      <PagePanel>
        <h2 className="text-ink text-lg font-semibold tracking-tight">{title}</h2>
        <div className="mt-4">{children}</div>
      </PagePanel>
    </section>
  );
}
