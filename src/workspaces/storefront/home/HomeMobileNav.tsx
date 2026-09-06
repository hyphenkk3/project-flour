"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

const MENU_ITEMS = [
  { href: "/order", label: "Order" },
  { href: "/browse", label: "Browse Cakes" },
  { href: "/extra", label: "Fresh Picks" },
  { href: "/faq", label: "FAQ" },
] as const;

function MenuMark() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M5 7.5h14M5 12h14M5 16.5h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function HomeMobileNav() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="relative md:hidden" ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="text-skyline hover:text-ink inline-flex min-h-11 min-w-11 items-center justify-center transition-colors duration-200"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <MenuMark />
      </button>
      {open ? (
        <nav
          className="border-fog/80 bg-paper absolute top-full right-0 z-30 mt-1 min-w-[12.75rem] rounded-[10px] border py-1 shadow-[0_8px_30px_rgba(28,25,22,0.08)]"
          id={menuId}
        >
          {MENU_ITEMS.map((item) => (
            <Link
              className="text-ink hover:bg-ink/[0.035] flex min-h-11 items-center px-4 text-sm transition-colors duration-200"
              href={item.href}
              key={item.href}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
