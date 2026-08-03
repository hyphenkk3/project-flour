import type { StatusTone } from "@/lib/design-tokens";

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
  className?: string;
};

const toneClass: Record<StatusTone, string> = {
  neutral: "bg-mist text-skyline ring-fog",
  info: "bg-status-info-soft text-status-info ring-status-info/20",
  success: "bg-status-success-soft text-status-success ring-status-success/20",
  warning: "bg-status-warning-soft text-status-warning ring-status-warning/20",
  danger: "bg-status-danger-soft text-status-danger ring-status-danger/20",
};

export function StatusBadge({
  label,
  tone = "neutral",
  className = "",
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClass[tone]} ${className}`.trim()}
    >
      {label}
    </span>
  );
}
