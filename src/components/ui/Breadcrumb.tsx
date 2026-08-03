import Link from "next/link";
import type { ReactNode } from "react";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumb({ items, className = "" }: BreadcrumbProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className={`min-w-0 ${className}`.trim()}>
      <ol className="text-skyline flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li
              className="flex min-w-0 items-center gap-2"
              key={`${item.label}-${index}`}
            >
              {index > 0 ? (
                <span aria-hidden="true" className="text-fog">
                  /
                </span>
              ) : null}
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={
                    isLast ? "text-ink truncate font-medium" : "truncate"
                  }
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  className="hover:text-ink truncate underline-offset-2 hover:underline"
                  href={item.href}
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type BreadcrumbTrailProps = {
  children: ReactNode;
};

/** Optional wrapper when breadcrumbs sit above a page header. */
export function BreadcrumbTrail({ children }: BreadcrumbTrailProps) {
  return <div className="mb-3">{children}</div>;
}
