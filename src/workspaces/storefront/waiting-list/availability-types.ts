export type CustomerWaitingListAvailabilityOption = {
  cakeId: string;
  sizeId: string;
  cakeName: string;
  sizeLabel: string;
  price: number;
  photoUrl: string | null;
  photoAlt: string | null;
};

export type CustomerWaitingListAvailability = {
  pickupDate: string;
  collectionId: string | null;
  options: CustomerWaitingListAvailabilityOption[];
};
