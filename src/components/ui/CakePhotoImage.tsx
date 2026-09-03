"use client";

import Image from "next/image";

type CakePhotoImageProps = {
  src: string;
  alt: string;
  className?: string;
  sizes: string;
  priority?: boolean;
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
}: CakePhotoImageProps) {
  return (
    <div className={["relative h-full w-full", className].filter(Boolean).join(" ")}>
      {canOptimizeRemote(src) ? (
        <Image
          alt={alt}
          className="object-cover"
          fill
          priority={priority}
          sizes={sizes}
          src={src}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt}
          className="h-full w-full object-cover"
          loading={priority ? "eager" : "lazy"}
          src={src}
        />
      )}
    </div>
  );
}
