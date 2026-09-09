"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type StorefrontOverlayProps = {
  labelledBy: string;
  panelClassName: string;
  children: ReactNode;
};

/**
 * The dialog element is the sheet itself. A full-viewport flex wrapper
 * around a nested panel is what iOS Safari hit-tests instead of the
 * buttons inside the sheet. Cart overlay works because its dialog is
 * the interactive surface, not a transparent parent.
 */
export function StorefrontOverlay({
  labelledBy,
  panelClassName,
  children,
}: StorefrontOverlayProps) {
  return createPortal(
    <>
      <div
        aria-hidden
        className="bg-ink/40 animate-storefront-fade pointer-events-none fixed inset-0 z-50"
      />
      <div
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={`fixed inset-x-0 bottom-0 z-[60] md:top-1/2 md:bottom-auto md:left-1/2 md:right-auto md:-translate-x-1/2 md:-translate-y-1/2 ${panelClassName}`}
        role="dialog"
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
