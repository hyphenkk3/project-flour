import { storefrontViewport } from "@/workspaces/storefront/storefront-viewport";

export const viewport = storefrontViewport;

export default function StorefrontBrowseLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
