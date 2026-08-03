import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  compact?: boolean;
  action?: ReactNode;
  className?: string;
};

/**
 * Shared empty state for directories, lists, and future placeholders.
 * Shell `EmptyState` re-exports this API for existing imports.
 */
export function EmptyState({
  title,
  description,
  compact = false,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={
        compact
          ? `border-fog rounded-xl border bg-white px-4 py-6 text-center ${className}`.trim()
          : `border-fog rounded-2xl border bg-white px-6 py-10 text-center shadow-sm md:px-10 md:py-12 ${className}`.trim()
      }
    >
      <p
        className={
          compact
            ? "text-ink text-sm font-medium"
            : "text-ink text-base font-medium md:text-lg"
        }
      >
        {title}
      </p>
      {description ? (
        <p
          className={
            compact
              ? "text-skyline mx-auto mt-1.5 max-w-md text-sm"
              : "text-skyline mx-auto mt-2 max-w-md text-sm"
          }
        >
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
