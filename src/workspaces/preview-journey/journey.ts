export type JourneyStep =
  | "website"
  | "submitted"
  | "summary_sent"
  | "confirmed"
  | "payment_requested"
  | "receipt_submitted"
  | "payment_verified"
  | "production_started"
  | "ready_for_collection"
  | "customer_arrived"
  | "order_verified"
  | "collected";

export const JOURNEY_STEPS: JourneyStep[] = [
  "website",
  "submitted",
  "summary_sent",
  "confirmed",
  "payment_requested",
  "receipt_submitted",
  "payment_verified",
  "production_started",
  "ready_for_collection",
  "customer_arrived",
  "order_verified",
  "collected",
];

const STEP_SET = new Set<string>(JOURNEY_STEPS);

export function parseJourneyStep(value?: string): JourneyStep | null {
  if (!value || !STEP_SET.has(value)) {
    return null;
  }
  return value as JourneyStep;
}

export function journeyStepRank(step: JourneyStep): number {
  return JOURNEY_STEPS.indexOf(step);
}

export type JourneyWorkspace =
  "website" | "customer_operations" | "bakery" | "collection";

export function journeyOwner(step: JourneyStep): JourneyWorkspace {
  if (step === "website") {
    return "website";
  }
  if (journeyStepRank(step) <= journeyStepRank("payment_verified")) {
    return "customer_operations";
  }
  if (journeyStepRank(step) < journeyStepRank("customer_arrived")) {
    return "bakery";
  }
  return "collection";
}

export function websiteJourneyHref(step: JourneyStep = "website"): string {
  return `/browse/chocolate-damour?step=${step}`;
}

export function websiteOrderHref(step: JourneyStep = "website"): string {
  return `/order?cake=chocolate-damour&size=6-inch&step=${step}`;
}

export function customerOperationsJourneyHref(step: JourneyStep): string {
  return `/preview/customer-operations?step=${step}`;
}

export function customerOperationsOrderJourneyHref(
  orderId: string,
  step: JourneyStep,
): string {
  return `/preview/customer-operations/orders/${orderId}?step=${step}`;
}

export function bakeryJourneyHref(step: JourneyStep): string {
  return `/preview/bakery?step=${step}`;
}

export function bakeryOrderJourneyHref(
  orderId: string,
  step: JourneyStep,
): string {
  return `/preview/bakery/orders/${orderId}?step=${step}`;
}

export function collectionJourneyHref(step: JourneyStep): string {
  return `/preview/collection?step=${step}`;
}

export function collectionOrderJourneyHref(
  orderId: string,
  step: JourneyStep,
): string {
  return `/preview/collection/orders/${orderId}?step=${step}`;
}

export function journeyWorkspaceHref(
  workspace: JourneyWorkspace,
  step: JourneyStep,
): string {
  switch (workspace) {
    case "website":
      return websiteJourneyHref(step === "website" ? "website" : step);
    case "customer_operations": {
      const coStep = step === "website" ? "submitted" : step;
      return customerOperationsOrderJourneyHref("amy", coStep);
    }
    case "bakery": {
      const bakeryStep =
        journeyStepRank(step) < journeyStepRank("payment_verified")
          ? "payment_verified"
          : step;
      if (journeyStepRank(bakeryStep) >= journeyStepRank("customer_arrived")) {
        return bakeryJourneyHref(bakeryStep);
      }
      return bakeryOrderJourneyHref("amy", bakeryStep);
    }
    case "collection": {
      const collectionStep =
        journeyStepRank(step) < journeyStepRank("ready_for_collection")
          ? "ready_for_collection"
          : step;
      if (collectionStep === "collected") {
        return collectionJourneyHref(collectionStep);
      }
      return collectionOrderJourneyHref("amy", collectionStep);
    }
  }
}
