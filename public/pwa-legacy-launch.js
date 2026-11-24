(function () {
  "use strict";

  var location = window.location;
  var searchParams = new URLSearchParams(location.search);
  if (
    location.pathname !== "/" ||
    searchParams.get("pwaLaunch") === "1" ||
    searchParams.get("pwaResumeChecked") === "1" ||
    window.__whitebirdLegacyPwaResumeStarted
  ) {
    return;
  }

  var iosStandalone = navigator.standalone === true;
  var displayModeStandalone = false;
  try {
    displayModeStandalone = window.matchMedia(
      "(display-mode: standalone)",
    ).matches;
  } catch (_error) {
    displayModeStandalone = false;
  }

  if (!iosStandalone && !displayModeStandalone) return;

  window.__whitebirdLegacyPwaResumeStarted = true;
  var signal =
    iosStandalone && displayModeStandalone
      ? "both"
      : iosStandalone
        ? "ios"
        : "display-mode";
  var target = new URL("/auth/session-resume", location.origin);
  target.searchParams.set("from", "legacy-pwa");
  target.searchParams.set("standaloneSignal", signal);

  var documentElement = document.documentElement;
  var oldVisibility = documentElement.style.visibility;
  documentElement.style.visibility = "hidden";
  window.setTimeout(function () {
    if (location.pathname === "/") {
      documentElement.style.visibility = oldVisibility;
      window.__whitebirdLegacyPwaResumeStarted = false;
    }
  }, 7000);

  location.replace(target.pathname + target.search);
})();
