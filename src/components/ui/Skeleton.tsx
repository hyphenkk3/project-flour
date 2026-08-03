type SkeletonProps = {
  className?: string;
};

/** Single shimmer block. Compose for page-level loading placeholders. */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`bg-fog/70 animate-skeleton rounded-lg ${className}`.trim()}
    />
  );
}

type SkeletonTextProps = {
  lines?: number;
  className?: string;
};

export function SkeletonText({ lines = 3, className = "" }: SkeletonTextProps) {
  return (
    <div className={`space-y-2 ${className}`.trim()}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          className={index === lines - 1 ? "h-3 w-2/3" : "h-3 w-full"}
          key={index}
        />
      ))}
    </div>
  );
}

type SkeletonCardProps = {
  className?: string;
};

export function SkeletonCard({ className = "" }: SkeletonCardProps) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={`border-fog rounded-2xl border bg-white p-4 shadow-sm ${className}`.trim()}
    >
      <div className="flex items-start gap-3">
        <Skeleton className="size-11 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <SkeletonText lines={2} />
        </div>
      </div>
    </div>
  );
}

type PageSkeletonProps = {
  cards?: number;
};

export function PageSkeleton({ cards = 3 }: PageSkeletonProps) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-12 w-full" />
      <ul className="grid gap-3">
        {Array.from({ length: cards }, (_, index) => (
          <li key={index}>
            <SkeletonCard />
          </li>
        ))}
      </ul>
    </div>
  );
}
