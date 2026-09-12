export const STAFF_FORCED_PASSWORD_CHANGE_PATH =
  "/staff/complete-password-change";

export const STAFF_FORCED_PASSWORD_COPY = {
  heading: "Create a new password",
  explanation:
    "Your password was reset by a Whitebird administrator. Please create a new password before continuing.",
  helperTitle: "Password requirements",
  helperMinLength: "At least 6 characters.",
  notRequired: "Your password is already up to date.",
  flagClearFailed:
    "Your new password was saved, but we couldn't finish setup. Please try again.",
  submit: "Save new password",
  submitting: "Saving password…",
  signOut: "Sign out",
} as const;
