"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/library/cakes", label: "Cakes" },
  { href: "/library/collections", label: "Catalogues" },
  { href: "/library/order-availability", label: "Order availability" },
  { href: "/library/operating-hours", label: "Operating hours" },
  { href: "/library/promotions", label: "Promotions" },
  { href: "/library/vouchers", label: "Vouchers" },
  { href: "/library/assets", label: "Assets" },
] as const;

export function LibraryNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Master Library sections"
      className="border-fog mb-6 flex flex-wrap gap-1 border-b"
    >
      {ITEMS.map((item) => {
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
