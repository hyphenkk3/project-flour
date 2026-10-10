/*
 * Test-only compatibility harness for legacy worker behavior tests.
 *
 * This is not imported by application code. It may only be enabled by the
 * explicit local test flag below, replaces the pause module for that process,
 * and blocks fetch so the suites can exercise their injected fake mailers
 * without sending email or contacting hosted services.
 */
import Module from "node:module";

if (process.env.WHITEBIRD_TEST_ONLY_UNPAUSED_LEGACY_WORKER !== "1") {
  throw new Error("Refusing to enable the test-only legacy worker harness.");
}

let interceptedPauseImports = 0;
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (
    request === "@/foundation/staff/legacy-staff-notification-email-pause" ||
    request.endsWith("/legacy-staff-notification-email-pause")
  ) {
    interceptedPauseImports += 1;
    return Object.freeze({
      LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED: false,
      runUnlessLegacyStaffNotificationEmailIsPaused: (run) => run(),
    });
  }

  return originalLoad.call(this, request, parent, isMain);
};

globalThis.fetch = async () => {
  throw new Error(
    "Network access is disabled in the legacy worker test harness.",
  );
};

process.once("beforeExit", () => {
  if (interceptedPauseImports === 0) {
    throw new Error(
      "The legacy pause module was not intercepted by the test harness.",
    );
  }
});
