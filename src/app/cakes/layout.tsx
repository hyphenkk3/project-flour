import { StorefrontShell } from "@/workspaces/storefront/StorefrontShell";
import { storefrontViewport } from "@/workspaces/storefront/storefront-viewport";

export const viewport = storefrontViewport;

export default function StorefrontCakesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <StorefrontShell>{children}</StorefrontShell>;
}
