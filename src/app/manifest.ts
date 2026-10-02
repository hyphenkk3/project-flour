import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Whitebird",
    short_name: "Whitebird",
    description: "Whitebird Cake House",
    start_url: "/",
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
