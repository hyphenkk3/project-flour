/**
 * @param {number} acceptedQuantity
 * @param {number} previouslyConvertedQuantity
 */
export function waitingListConvertibleQuantity(
  acceptedQuantity,
  previouslyConvertedQuantity,
) {
  if (
    !Number.isSafeInteger(acceptedQuantity) ||
    !Number.isSafeInteger(previouslyConvertedQuantity)
  ) {
    return 0;
  }
  return Math.max(0, acceptedQuantity - previouslyConvertedQuantity);
}
