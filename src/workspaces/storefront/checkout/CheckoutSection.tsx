import type { ReactNode } from "react";

type CheckoutSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function CheckoutSection({
  title,
  description,
  children,
  className = "",
}: CheckoutSectionProps) {
  return (
    <section className={`space-y-5 ${className}`.trim()}>
      <div className="space-y-2">
        <h2 className="font-display text-ink text-2xl tracking-tight">
          {title}
        </h2>
        {description ? (
          <p className="text-skyline text-sm leading-relaxed">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
