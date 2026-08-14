"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/customer-operations/customers", label: "Customers" },
  { href: "/customer-operations/orders", label: "Orders" },
] as const;

type CustomerOperationsNavProps = {
  /** Manager-only: review pending exception approvals without the Operations board. */
  showApprovalsLink?: boolean;
};

export function CustomerOperationsNav({
  showApprovalsLink = false,
}: CustomerOperationsNavProps) {
  const pathname = usePathname();
  const items = showApprovalsLink
    ? [...ITEMS, { href: "/owner/approvals", label: "Approvals" }]
    : [...ITEMS];

  return (
    <nav
      aria-label="Customer Operations sections"
      className="border-fog mb-6 flex gap-1 border-b"
    >
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "text-ink border-signal -mb-px border-b-2 px-3 py-2.5 text-sm font-semibold"
                : "text-skyline hover:text-ink px-3 py-2.5 text-sm font-medium"
            }
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
