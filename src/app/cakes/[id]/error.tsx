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
      title="This cake page"
      unstable_retry={unstable_retry}
    />
  );
}
