"use client";

import Image from "next/image";
import { useState } from "react";

type CakePhotoImageProps = {
  src: string;
  alt: string;
  className?: string;
  sizes: string;
  priority?: boolean;
  objectFit?: "cover" | "contain";
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

export function CakePhotoImage(props: CakePhotoImageProps) {
  return <CakePhotoImageSource key={props.src} {...props} />;
}

function CakePhotoImageSource({
  src,
  alt,
  className,
  sizes,
  priority = false,
  objectFit = "cover",
  zoomOnHover = false,
}: CakePhotoImageProps) {
  const [failed, setFailed] = useState(false);
  const imageClass = [
    "rounded-[10px]",
    objectFit === "contain" ? "object-contain" : "object-cover",
    zoomOnHover
      ? "transition duration-700 ease-out motion-reduce:transition-none md:group-hover:scale-[1.035]"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={[
        "relative h-full w-full overflow-hidden rounded-[10px]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {failed ? (
        <div
          aria-label={`${alt} — photo unavailable`}
          className="bg-fog text-skyline flex h-full w-full items-center justify-center px-4 text-center text-sm"
          role="img"
        >
          Photo temporarily unavailable
        </div>
      ) : canOptimizeRemote(src) ? (
        <Image
          alt={alt}
          className={imageClass}
          fill
          onError={() => setFailed(true)}
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
          onError={() => setFailed(true)}
          src={src}
        />
      )}
    </div>
  );
}
