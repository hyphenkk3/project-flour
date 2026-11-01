export type AddonCollection = {
  id: string;
  name: string;
  status: string;
};

export type AddonAssignment = {
  collectionId: string;
  isAvailable: boolean;
  customerSelectable: boolean;
  sortOrder: number;
  availableFrom: string | null;
  availableUntil: string | null;
  isDefault?: boolean;
  defaultQuantity?: number;
};

export type ComplimentaryCatalogItem = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  assignments: AddonAssignment[];
};

export type PaidAddonCatalogItem = {
  id: string;
  code: string;
  name: string;
  unitPrice: number;
  financialShorthand: string;
  isActive: boolean;
  sortOrder: number;
  maxQuantity: number;
  assignments: AddonAssignment[];
};

export type AddonCatalogueSnapshot = {
  collections: AddonCollection[];
  complimentary: ComplimentaryCatalogItem[];
  paid: PaidAddonCatalogItem[];
};
