import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // Keep the existing app identity rooted at `/` while giving an installed
    // launch a server-verifiable entry marker. The marker is never auth proof.
    id: "/",
    name: "Whitebird",
    short_name: "Whitebird",
    description: "Whitebird Cake House",
    start_url: "/?pwaLaunch=1",
    scope: "/",
    display: "standalone",
    background_color: "#F5F0E9",
    theme_color: "#F5F0E9",
    icons: [
      {
        src: "/icons/whitebird-w-bird-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/whitebird-w-bird-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
