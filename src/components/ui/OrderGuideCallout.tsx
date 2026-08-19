import {
  ORDER_GUIDE_LINES,
  ORDER_GUIDE_TITLE,
} from "@/engines/orders/order-guide";

type OrderGuideCalloutProps = {
  className?: string;
};

export function OrderGuideCallout({ className }: OrderGuideCalloutProps) {
  return (
    <aside
      aria-label={ORDER_GUIDE_TITLE}
      className={[
        "border-fog bg-mist/50 rounded-lg border px-3 py-2.5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="text-skyline text-[0.65rem] font-semibold tracking-[0.14em] uppercase">
        {ORDER_GUIDE_TITLE}
      </p>
      <ul className="text-ink mt-1.5 space-y-0.5 text-sm leading-snug">
        {ORDER_GUIDE_LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </aside>
  );
}
