import type { Metadata } from "next";
import { StorefrontHomePage } from "@/workspaces/storefront/home/StorefrontHomePage";
import { StorefrontPinchZoomLock } from "@/workspaces/storefront/StorefrontPinchZoomLock";
import { storefrontViewport } from "@/workspaces/storefront/storefront-viewport";

export const metadata: Metadata = {
  title: "Whitebird",
  description: "Preorder a cake for pickup.",
};

export const viewport = storefrontViewport;

export default function HomePage() {
  return (
    <>
      <StorefrontPinchZoomLock />
      <StorefrontHomePage />
    </>
  );
}
