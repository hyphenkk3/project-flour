"use client";

import { useEffect } from "react";
import {
  AVAILABILITY_WORKSPACE_SECTIONS,
  isAvailabilitySectionId,
} from "@/workspaces/library/order-availability/availability-sections";
import { scrollAvailabilitySectionIntoView } from "@/workspaces/library/order-availability/scroll-availability-section";

const tabClass =
  "border-fog text-ink hover:border-skyline inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium";

function hashSectionId(): string {
  return window.location.hash.replace(/^#/, "");
}

function scrollHash(behavior: ScrollBehavior): void {
  const id = hashSectionId();
  if (!isAvailabilitySectionId(id)) return;
  scrollAvailabilitySectionIntoView(id, { behavior });
}

export function AvailabilitySectionNav() {
  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!cancelled) scrollHash("auto");
      });
    });
    const timeout = window.setTimeout(() => {
      if (!cancelled) scrollHash("auto");
    }, 120);

    const onHash = () => scrollHash("smooth");
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
  }, []);

  return (
    <nav
      aria-label="Availability sections"
      className="border-fog bg-mist/95 sticky top-16 z-20 -mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 py-2"
      data-availability-section-nav=""
    >
      {AVAILABILITY_WORKSPACE_SECTIONS.map((section) => (
        <a
          className={tabClass}
          href={`#${section.id}`}
          key={section.id}
          onClick={(event) => {
            event.preventDefault();
            const next = new URL(window.location.href);
            next.hash = section.id;
            if (hashSectionId() !== section.id) {
              window.history.pushState(
                null,
                "",
                `${next.pathname}${next.search}${next.hash}`,
              );
            }
            scrollAvailabilitySectionIntoView(section.id, {
              behavior: "smooth",
              focus: true,
            });
          }}
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}
