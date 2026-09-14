export const CAKE_PHOTO_DISCLAIMER =
  "Please note: Photos are for illustration purposes only. As our cakes are handmade, the actual cake may vary slightly in appearance, decoration, colour, and finishing from the photo shown.";

type CakePhotoDisclaimerProps = {
  className?: string;
};

export function CakePhotoDisclaimer({
  className = "",
}: CakePhotoDisclaimerProps) {
  return (
    <p
      className={`text-skyline text-xs leading-relaxed sm:text-sm ${className}`.trim()}
    >
      {CAKE_PHOTO_DISCLAIMER}
    </p>
  );
}
