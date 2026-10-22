"use client";

import { StorefrontRouteError } from "@/workspaces/storefront/StorefrontRouteError";

export default function Error({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <StorefrontRouteError
      title="This month’s full cake menu"
      unstable_retry={unstable_retry}
    />
  );
}
