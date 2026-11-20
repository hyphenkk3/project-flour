import type { ReactNode } from "react";

type PageContainerProps = {
  children: ReactNode;
  compactHome?: boolean;
};

export function PageContainer({
  children,
  compactHome = false,
}: PageContainerProps) {
  return (
    <div
      className={`mx-auto w-full max-w-5xl px-4 ${compactHome ? "pt-3 pb-28 md:py-8 md:pb-8" : "py-6 pb-28 md:py-8 md:pb-8"} md:px-8`}
    >
      {children}
    </div>
  );
}
