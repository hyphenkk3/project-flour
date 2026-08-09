/**
 * Guest-order collection lifecycle — independent of financial order_status.
 * Precedence: picked up > ready > not ready.
 */

export type OperationalState = "not_ready" | "ready" | "picked_up";

export type OperationalTimestamps = {
  readyAt: string | null;
  pickedUpAt: string | null;
};

export function deriveOperationalState(
  input: OperationalTimestamps,
): OperationalState {
  if (input.pickedUpAt) return "picked_up";
  if (input.readyAt) return "ready";
  return "not_ready";
}

export function operationalStateLabel(state: OperationalState): string {
  switch (state) {
    case "not_ready":
      return "Not Ready";
    case "ready":
      return "Ready";
    case "picked_up":
      return "Picked Up";
  }
}

/** Calendar scan markers — Picked Up wins over Ready. */
export function operationalStateMarker(state: OperationalState): "" | "●" | "✓" {
  switch (state) {
    case "picked_up":
      return "✓";
    case "ready":
      return "●";
    case "not_ready":
      return "";
  }
}

export function operationalMarkerFromTimestamps(
  input: OperationalTimestamps,
): "" | "●" | "✓" {
  return operationalStateMarker(deriveOperationalState(input));
}

/** Prefix display name with ● / ✓ when present. */
export function withOperationalMarker(
  displayName: string,
  input: OperationalTimestamps,
): string {
  const marker = operationalMarkerFromTimestamps(input);
  return marker ? `${marker} ${displayName}` : displayName;
}
