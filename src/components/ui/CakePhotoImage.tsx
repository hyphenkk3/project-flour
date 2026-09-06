"use client";

import Image from "next/image";

type CakePhotoImageProps = {
  src: string;
  alt: string;
  className?: string;
  sizes: string;
  priority?: boolean;
  /** Desktop-only, reduced-motion-safe photo lift. */
  zoomOnHover?: boolean;
};

function canOptimizeRemote(src: string): boolean {
  try {
    const host = new URL(src).hostname;
    return (
      host.endsWith(".supabase.co") ||
      host === "images.unsplash.com" ||
      host === "localhost" ||
      host === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

export function CakePhotoImage({
  src,
  alt,
  className,
  sizes,
  priority = false,
  zoomOnHover = false,
}: CakePhotoImageProps) {
  const imageClass = [
    "object-cover",
    zoomOnHover
      ? "transition duration-700 ease-out motion-reduce:transition-none md:group-hover:scale-[1.035]"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={["relative h-full w-full", className].filter(Boolean).join(" ")}>
      {canOptimizeRemote(src) ? (
        <Image
          alt={alt}
          className={imageClass}
          fill
          priority={priority}
          sizes={sizes}
          src={src}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt}
          className={`h-full w-full ${imageClass}`}
          loading={priority ? "eager" : "lazy"}
          src={src}
        />
      )}
    </div>
  );
}
