import {
  ORDER_HEALTH_LABEL,
  ORDER_HEALTH_MARK,
  type PreviewOrderHealth,
} from "@/workspaces/customer-operations/preview/preview-demo";

type OrderHealthBadgeProps = {
  health: PreviewOrderHealth;
  size?: "sm" | "md";
};

const healthClass: Record<PreviewOrderHealth, string> = {
  healthy: "bg-status-success-soft text-status-success",
  waiting: "bg-status-warning-soft text-status-warning",
  needs_attention: "bg-status-danger-soft text-status-danger",
};

export function OrderHealthBadge({
  health,
  size = "sm",
}: OrderHealthBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${healthClass[health]} ${
        size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"
      }`}
    >
      <span aria-hidden>{ORDER_HEALTH_MARK[health]}</span>
      {ORDER_HEALTH_LABEL[health]}
    </span>
  );
}
