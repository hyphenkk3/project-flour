export type LibraryActionState = {
  error: string | null;
  success?: string | null;
};

export const libraryActionInitialState: LibraryActionState = {
  error: null,
  success: null,
};
