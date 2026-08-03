import type { ReactNode } from "react";

type PageSectionProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Softer dashed panel for future / placeholder sections. */
  muted?: boolean;
  className?: string;
};

export function PageSection({
  title,
  description,
  action,
  children,
  muted = false,
  className = "",
}: PageSectionProps) {
  return (
    <section className={`space-y-3 ${className}`.trim()}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-ink text-sm font-semibold">{title}</h3>
          {description ? (
            <p className="text-skyline mt-1 text-sm">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div
        className={
          muted
            ? "border-fog rounded-xl border border-dashed bg-white/50 px-4 py-3"
            : undefined
        }
      >
        {children}
      </div>
    </section>
  );
}

type PagePanelProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

/** Bordered content panel used inside page sections. */
export function PagePanel({ title, children, className = "" }: PagePanelProps) {
  return (
    <div
      className={`border-fog rounded-2xl border bg-white p-5 shadow-sm ${className}`.trim()}
    >
      {title ? (
        <h3 className="text-ink text-sm font-semibold">{title}</h3>
      ) : null}
      <div className={title ? "mt-4" : undefined}>{children}</div>
    </div>
  );
}
