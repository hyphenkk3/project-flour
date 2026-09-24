import { StorefrontPinchZoomLock } from "@/workspaces/storefront/StorefrontPinchZoomLock";
import { storefrontViewport } from "@/workspaces/storefront/storefront-viewport";

export const viewport = storefrontViewport;

export default function StorefrontExtraLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <StorefrontPinchZoomLock />
      {children}
    </>
  );
}
