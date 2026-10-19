type WosSyncDiagnosticDetails = Record<
  string,
  string | number | boolean | null | undefined
>;

/** Opt-in Preview diagnostics. Logs timing only; never logs order or customer data. */
export function traceWosSync(
  stage: string,
  details: WosSyncDiagnosticDetails = {},
): void {
  if (typeof window === "undefined") return;
  if (new URLSearchParams(window.location.search).get("wosSyncTrace") !== "1") {
    return;
  }

  console.info("[wos-sync]", {
    stage,
    wallClock: new Date().toISOString(),
    monotonicMs: Math.round(performance.now()),
    ...details,
  });
}
