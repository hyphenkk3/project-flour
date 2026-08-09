/**
 * Typed design tokens for Whitebird Operating System UI.
 * Visual values live in `src/app/globals.css`; use these for variant maps.
 */

export const statusTone = {
  neutral: "neutral",
  info: "info",
  success: "success",
  warning: "warning",
  /** Operational red — guest-order Awaiting Payment (not danger/error). */
  progress: "progress",
  danger: "danger",
} as const;

export type StatusTone = (typeof statusTone)[keyof typeof statusTone];

export const toastTone = {
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
} as const;

export type ToastTone = (typeof toastTone)[keyof typeof toastTone];
