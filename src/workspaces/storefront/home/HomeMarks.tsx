import type { ReactNode } from "react";

type HomeMarkProps = {
  className?: string;
};

function Mark({
  className = "h-4 w-4",
  children,
}: HomeMarkProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );
}

export function CakeMark({ className }: HomeMarkProps) {
  return (
    <Mark className={className}>
      <path
        d="M5 14.5c.4-2 1.8-3.2 3.6-3.6.6 1.4 2 2.3 3.4 2.3s2.8-.9 3.4-2.3c1.8.4 3.2 1.6 3.6 3.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <path
        d="M4.5 14.5h15V18a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4.5 18v-3.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M12 7.5c.8 0 1.4-.7 1.4-1.4S12.8 4.7 12 4.7s-1.4.7-1.4 1.4.6 1.4 1.4 1.4Zm0 0v3.3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </Mark>
  );
}

export function LeafMark({ className }: HomeMarkProps) {
  return (
    <Mark className={className}>
      <path
        d="M5.5 16.5c2-6.5 7.2-10.2 13-11-1.2 5.6-4.8 11.2-12.2 12.2-1.3.2-1.8-.7-.8-1.2Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M9 14.5c1.6-1.8 3.8-2.8 6.2-3.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </Mark>
  );
}

export function HeartMark({ className }: HomeMarkProps) {
  return (
    <Mark className={className}>
      <path
        d="M12 18.2s-6.2-3.8-6.2-8.1A3.4 3.4 0 0 1 12 7.6a3.4 3.4 0 0 1 6.2 2.5c0 4.3-6.2 8.1-6.2 8.1Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </Mark>
  );
}

export function BrowseMark({ className }: HomeMarkProps) {
  return (
    <Mark className={className}>
      <path
        d="M5.5 5.5h5v5h-5v-5Zm8 0h5v5h-5v-5Zm-8 8h5v5h-5v-5Zm8 0h5v5h-5v-5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </Mark>
  );
}

export function WhatsAppMark({ className }: HomeMarkProps) {
  return (
    <Mark className={className}>
      <path
        d="M7.2 16.6 6 19l2.6-.8A7.2 7.2 0 1 0 7.2 16.6Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </Mark>
  );
}

export function SparkMark({ className }: HomeMarkProps) {
  return (
    <Mark className={className}>
      <path
        d="M12 4.5v3.2M12 16.3V19.5M4.5 12h3.2M16.3 12H19.5M7.2 7.2l2.1 2.1M14.7 14.7l2.1 2.1M16.8 7.2l-2.1 2.1M9.3 14.7l-2.1 2.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </Mark>
  );
}
