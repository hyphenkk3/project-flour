import type { ReactNode } from "react";
import { PagePanel } from "@/components/ui";

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
    <section aria-labelledby={id}>
      <PagePanel>
        <h2
          className="text-ink text-lg font-semibold tracking-tight"
          id={id}
        >
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </PagePanel>
    </section>
  );
}
