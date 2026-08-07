/**
 * Demo availability for Today's Fresh Picks (ENG-002A).
 *
 * Switch `FRESH_PICKS_DEMO.status` to exercise all four UI states:
 * - "available"   → State A (Available Today)
 * - "limited"     → State B (Limited)
 * - "updating"    → State C (Updating, button disabled)
 * - "unavailable" → State D (Unavailable, button disabled)
 */
export type FreshPicksStatus =
  "available" | "limited" | "updating" | "unavailable";

export type FreshPicksDemo = {
  status: FreshPicksStatus;
  /** Used when status is available or limited. */
  count: number;
};

export const FRESH_PICKS_DEMO: FreshPicksDemo = {
  status: "available",
  count: 3,
};

export function freshPicksCopy(demo: FreshPicksDemo): {
  eyebrow: string;
  body: string;
  buttonLabel: string;
  enabled: boolean;
} {
  switch (demo.status) {
    case "available":
      return {
        eyebrow: "Available Today",
        body:
          demo.count === 1
            ? "1 cake available today."
            : `${demo.count} cakes available today.`,
        buttonLabel: "View Today's Fresh Picks",
        enabled: true,
      };
    case "limited":
      return {
        eyebrow: "Limited",
        body:
          demo.count === 1
            ? "Only 1 cake remaining today."
            : `Only ${demo.count} cakes remaining today.`,
        buttonLabel: "View Today's Fresh Picks",
        enabled: true,
      };
    case "updating":
      return {
        eyebrow: "Updating",
        body: "Today's availability is being updated.",
        buttonLabel: "View Today's Fresh Picks",
        enabled: false,
      };
    case "unavailable":
      return {
        eyebrow: "Unavailable",
        body: "No cakes available today.",
        buttonLabel: "View Today's Fresh Picks",
        enabled: false,
      };
  }
}
