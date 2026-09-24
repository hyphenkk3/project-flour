export type Rm10LibraryActionState = {
  error: string | null;
  createdCount: number;
  existingNumbers: string[];
};

export const rm10LibraryActionInitialState: Rm10LibraryActionState = {
  error: null,
  createdCount: 0,
  existingNumbers: [],
};
