"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkspaceNavItem } from "@/foundation/navigation/workspaces";
import { isWorkspaceNavActive } from "@/foundation/navigation/is-active";
import { activeItemScrollTarget } from "@/foundation/navigation/mobile-scroll";
import { WorkspaceLink } from "@/components/shell/WorkspaceLink";

type MobileNavigationProps = {
  items: WorkspaceNavItem[];
  currentPath: string;
};

const MOBILE_LABELS: Record<string, string> = {
  home: "Home",
  owner: "Operations",
  owner_calendar: "Calendar",
  bakery: "Bakery",
  collection: "Collection",
  library: "Library",
  customer_operations: "Customers",
  management: "Management",
};

export function MobileNavigation({
  items,
  currentPath,
}: MobileNavigationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasMoreLeft, setHasMoreLeft] = useState(false);
  const [hasMoreRight, setHasMoreRight] = useState(false);

  useEffect(() => {
    const container = scrollRef.current;
    const activeItem = container?.querySelector<HTMLElement>(
      '[aria-current="page"]',
    );
    if (!container || !activeItem) return;

    const containerBounds = container.getBoundingClientRect();
    const itemBounds = activeItem.getBoundingClientRect();
    const nextScrollLeft = activeItemScrollTarget(
      {
        left: containerBounds.left + container.clientLeft,
        right:
          containerBounds.left + container.clientLeft + container.clientWidth,
      },
      { left: itemBounds.left, right: itemBounds.right },
      container.scrollLeft,
    );
    if (nextScrollLeft === null) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    container.scrollTo({
      left: nextScrollLeft,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [currentPath, items]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const updateEdgeIndicators = () => {
      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      setHasMoreLeft(container.scrollLeft > 1);
      setHasMoreRight(maxScrollLeft - container.scrollLeft > 1);
    };

    updateEdgeIndicators();
    container.addEventListener("scroll", updateEdgeIndicators, {
      passive: true,
    });
    window.addEventListener("resize", updateEdgeIndicators);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateEdgeIndicators);
    observer?.observe(container);

    return () => {
      container.removeEventListener("scroll", updateEdgeIndicators);
      window.removeEventListener("resize", updateEdgeIndicators);
      observer?.disconnect();
    };
  }, [items.length]);

  return (
    <nav
      aria-label="Workspaces"
      className="border-fog fixed inset-x-0 bottom-0 z-40 max-w-full min-w-0 border-t bg-white/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
    >
      <div className="relative mx-auto w-full max-w-lg min-w-0">
        <div
          aria-describedby="mobile-workspace-scroll-hint"
          aria-label="Workspace links"
          className="flex w-full min-w-0 [scrollbar-width:none] items-stretch gap-0 overflow-x-auto overscroll-x-contain px-1 [&::-webkit-scrollbar]:hidden"
          ref={scrollRef}
          role="group"
          tabIndex={0}
        >
          {items.map((item) => (
            <div className="shrink-0" key={item.id}>
              <WorkspaceLink
                active={isWorkspaceNavActive(item, currentPath)}
                compact
                item={item}
                mobileLabel={MOBILE_LABELS[item.id] ?? item.label}
                mobileNavigation
              />
            </div>
          ))}
        </div>
        <span className="sr-only" id="mobile-workspace-scroll-hint">
          {hasMoreLeft || hasMoreRight
            ? "Scroll horizontally to see more workspaces."
            : "All available workspaces are visible."}
        </span>
        {hasMoreLeft ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-white/95 to-transparent"
          />
        ) : null}
        {hasMoreRight ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-white/95 to-transparent"
          />
        ) : null}
      </div>
    </nav>
  );
}
