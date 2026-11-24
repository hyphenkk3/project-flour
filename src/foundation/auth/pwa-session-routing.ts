export type SessionResumeSource = "pwa" | "login";
export type SessionAuthOutcome =
  | "verified"
  | "signed_out"
  | "rejected"
  | "temporarily_unavailable"
  | "not_checked";
export type SessionProfileOutcome =
  "active" | "inactive_or_missing" | "unavailable" | "not_checked";

export type SessionResumeDecision =
  "staff_workspace" | "public_home" | "login" | "retry";

export function decideSessionResume(input: {
  source: SessionResumeSource;
  authCookiePresent: boolean;
  auth: SessionAuthOutcome;
  profile: SessionProfileOutcome;
}): SessionResumeDecision {
  if (
    input.auth === "temporarily_unavailable" ||
    input.profile === "unavailable"
  ) {
    return "retry";
  }

  if (input.auth === "verified" && input.profile === "active") {
    return "staff_workspace";
  }

  if (
    input.source === "pwa" &&
    !input.authCookiePresent &&
    input.auth === "signed_out"
  ) {
    return "public_home";
  }

  return "login";
}
