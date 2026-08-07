import type { StatusTone } from "@/lib/design-tokens";
import {
  parseJourneyStep,
  type JourneyStep,
} from "@/workspaces/preview-journey/journey";

export type CounterCollectionMethod = "pickup" | "delivery" | "dine_in";

export type CounterStatus = "waiting" | "arrived" | "verified" | "completed";

export type CounterHeroState =
  "none" | "arrived" | "verified" | "collected" | "not_yet";

export type CounterTimelineEvent = {
  id: string;
  time: string;
  title: string;
  detail?: string;
  isCurrent?: boolean;
};

export type CounterRecommendedAction = {
  title: string;
  reason: string;
  buttonLabel: string;
};

export type CounterOrder = {
  id: string;
  guestLabel: string;
  cakeName: string;
  cakeSize: string;
  collectionDateLabel: string;
  collectionWeekday: string;
  collectionTime: string;
  collectionSort: number;
  collectionMethod: CounterCollectionMethod;
  specialNotes: string | null;
  packingItems: string[];
  internalNotes: string[];
  timeline: CounterTimelineEvent[];
  status: CounterStatus;
  arrivedAt: string | null;
  collectedAt: string | null;
  recommendedAction: CounterRecommendedAction;
};

export const COUNTER_COLLECTION_LABEL: Record<CounterCollectionMethod, string> =
  {
    pickup: "Pickup",
    delivery: "Delivery",
    dine_in: "Dine-In",
  };

export const COUNTER_STATUS_LABEL: Record<CounterStatus, string> = {
  waiting: "Ready for Counter",
  arrived: "Customer Arrived",
  verified: "Verified",
  completed: "Completed",
};

export const COUNTER_STATUS_TONE: Record<CounterStatus, StatusTone> = {
  waiting: "info",
  arrived: "warning",
  verified: "success",
  completed: "success",
};

export const COUNTER_BOARD_SECTIONS: {
  id: "waiting" | "arrived" | "completed";
  label: string;
  statuses: CounterStatus[];
}[] = [
  {
    id: "waiting",
    label: "Ready for Counter",
    statuses: ["waiting"],
  },
  {
    id: "arrived",
    label: "Customer Here",
    statuses: ["arrived", "verified"],
  },
  {
    id: "completed",
    label: "Completed",
    statuses: ["completed"],
  },
];

const HERO_ORDER_ID = "amy";

const AMY_ARRIVE_ACTION: CounterRecommendedAction = {
  title: "Customer Arrives",
  reason: "Cake is staged. Mark arrival when Amy is at the counter.",
  buttonLabel: "Customer Arrives",
};

const AMY_VERIFY_ACTION: CounterRecommendedAction = {
  title: "Verify Order",
  reason: "Amy is here. Check the cake and packing before handing over.",
  buttonLabel: "Verify Order",
};

const AMY_COLLECT_ACTION: CounterRecommendedAction = {
  title: "Mark Collected",
  reason: "Order is verified. Hand over the cake, then mark collected.",
  buttonLabel: "Mark Collected",
};

const AMY_DONE_ACTION: CounterRecommendedAction = {
  title: "Completed",
  reason: "Collected. Counter is done with this celebration.",
  buttonLabel: "Completed",
};

const AMY_WAITING_TIMELINE: CounterTimelineEvent[] = [
  {
    id: "amy-bakery",
    time: "14:40",
    title: "Ready for Counter",
    detail: "Bakery marked Chocolate D’Amour ready.",
  },
  {
    id: "amy-wait",
    time: "Now",
    title: "Waiting at the desk",
    detail: "Staged for 4:00 PM pickup.",
    isCurrent: true,
  },
];

const AMY_ARRIVED_TIMELINE: CounterTimelineEvent[] = [
  ...AMY_WAITING_TIMELINE.filter((event) => !event.isCurrent),
  {
    id: "amy-arrived",
    time: "15:52",
    title: "Customer arrived",
    detail: "Amy is at the counter.",
  },
  {
    id: "amy-check",
    time: "Now",
    title: "Verify before handover",
    detail: "Check cake, size, and packing.",
    isCurrent: true,
  },
];

const AMY_VERIFIED_TIMELINE: CounterTimelineEvent[] = [
  ...AMY_ARRIVED_TIMELINE.filter((event) => !event.isCurrent),
  {
    id: "amy-verified",
    time: "15:55",
    title: "Order verified",
    detail: "Cake and packing match.",
  },
  {
    id: "amy-handover",
    time: "Now",
    title: "Ready to hand over",
    detail: "Mark collected after the guest takes the cake.",
    isCurrent: true,
  },
];

const AMY_COLLECTED_TIMELINE: CounterTimelineEvent[] = [
  ...AMY_VERIFIED_TIMELINE.filter((event) => !event.isCurrent),
  {
    id: "amy-collected",
    time: "15:58",
    title: "Collected",
    detail: "Amy took Chocolate D’Amour home.",
  },
  {
    id: "amy-done",
    time: "Now",
    title: "Completed",
    detail: "No further Counter action.",
    isCurrent: true,
  },
];

export const COUNTER_PREVIEW_ORDERS: CounterOrder[] = [
  {
    id: HERO_ORDER_ID,
    guestLabel: "Amy Chen",
    cakeName: "Chocolate D’Amour",
    cakeSize: '6"',
    collectionDateLabel: "21 August",
    collectionWeekday: "Friday",
    collectionTime: "4:00 PM",
    collectionSort: 16 * 60,
    collectionMethod: "pickup",
    specialNotes: "Less sweet",
    packingItems: ["Knife", "Candle", "Birthday Topper", "Birthday Card"],
    internalNotes: [
      "Bakery staged at 14:40. Chiller A.",
      "Birthday packing must go with the cake.",
    ],
    timeline: AMY_WAITING_TIMELINE,
    status: "waiting",
    arrivedAt: null,
    collectedAt: null,
    recommendedAction: AMY_ARRIVE_ACTION,
  },
  {
    id: "meiling",
    guestLabel: "Mei Ling Tan",
    cakeName: "Earl Grey Pistachio",
    cakeSize: '6"',
    collectionDateLabel: "21 August",
    collectionWeekday: "Friday",
    collectionTime: "12:30 PM",
    collectionSort: 12 * 60 + 30,
    collectionMethod: "pickup",
    specialNotes: null,
    packingItems: ["Knife", "Box"],
    internalNotes: ["Staged in chiller A at 10:05."],
    timeline: [
      {
        id: "meiling-ready",
        time: "10:05",
        title: "Ready for Counter",
      },
      {
        id: "meiling-now",
        time: "Now",
        title: "Waiting at the desk",
        isCurrent: true,
      },
    ],
    status: "waiting",
    arrivedAt: null,
    collectedAt: null,
    recommendedAction: {
      title: "Customer Arrives",
      reason: "Cake is staged. Mark arrival when the guest is at the counter.",
      buttonLabel: "Customer Arrives",
    },
  },
  {
    id: "kenji",
    guestLabel: "Kenji Sato",
    cakeName: "Yuzu White Chocolate",
    cakeSize: '6"',
    collectionDateLabel: "21 August",
    collectionWeekday: "Friday",
    collectionTime: "1:00 PM",
    collectionSort: 13 * 60,
    collectionMethod: "pickup",
    specialNotes: null,
    packingItems: ["Knife", "Box"],
    internalNotes: ["Staged in chiller A at 10:20."],
    timeline: [
      {
        id: "kenji-ready",
        time: "10:20",
        title: "Ready for Counter",
      },
      {
        id: "kenji-now",
        time: "Now",
        title: "Waiting at the desk",
        isCurrent: true,
      },
    ],
    status: "waiting",
    arrivedAt: null,
    collectedAt: null,
    recommendedAction: {
      title: "Customer Arrives",
      reason: "Cake is staged. Mark arrival when the guest is at the counter.",
      buttonLabel: "Customer Arrives",
    },
  },
  {
    id: "farah",
    guestLabel: "Farah Ismail",
    cakeName: "Burnt Cheesecake",
    cakeSize: '8"',
    collectionDateLabel: "21 August",
    collectionWeekday: "Friday",
    collectionTime: "2:00 PM",
    collectionSort: 14 * 60,
    collectionMethod: "dine_in",
    specialNotes: null,
    packingItems: [],
    internalNotes: ["Dine-In. No box. Plate from Counter."],
    timeline: [
      {
        id: "farah-ready",
        time: "13:10",
        title: "Ready for Counter",
      },
      {
        id: "farah-arrived",
        time: "13:48",
        title: "Customer arrived",
      },
      {
        id: "farah-now",
        time: "Now",
        title: "Verify before handover",
        isCurrent: true,
      },
    ],
    status: "arrived",
    arrivedAt: "13:48",
    collectedAt: null,
    recommendedAction: {
      title: "Verify Order",
      reason: "Guest is here. Check the cake before serving.",
      buttonLabel: "Verify Order",
    },
  },
  {
    id: "rachel",
    guestLabel: "Rachel Wee",
    cakeName: "Pandan Mango",
    cakeSize: '6"',
    collectionDateLabel: "21 August",
    collectionWeekday: "Friday",
    collectionTime: "11:00 AM",
    collectionSort: 11 * 60,
    collectionMethod: "pickup",
    specialNotes: null,
    packingItems: ["Knife", "Box"],
    internalNotes: ["Collected at 11:08."],
    timeline: [
      {
        id: "rachel-ready",
        time: "10:00",
        title: "Ready for Counter",
      },
      {
        id: "rachel-arrived",
        time: "11:02",
        title: "Customer arrived",
      },
      {
        id: "rachel-verified",
        time: "11:05",
        title: "Order verified",
      },
      {
        id: "rachel-done",
        time: "11:08",
        title: "Collected",
        isCurrent: true,
      },
    ],
    status: "completed",
    arrivedAt: "11:02",
    collectedAt: "11:08",
    recommendedAction: {
      title: "Completed",
      reason: "Collected. Counter is done with this celebration.",
      buttonLabel: "Completed",
    },
  },
];

export function collectionHeroFromJourneyStep(
  step: JourneyStep,
): CounterHeroState {
  switch (step) {
    case "ready_for_collection":
      return "none";
    case "customer_arrived":
      return "arrived";
    case "order_verified":
      return "verified";
    case "collected":
      return "collected";
    default:
      return "not_yet";
  }
}

export function parseCounterHeroState(search: {
  step?: string;
  arrived?: string;
  verified?: string;
  collected?: string;
}): CounterHeroState {
  const journeyStep = parseJourneyStep(search.step);
  if (journeyStep) {
    return collectionHeroFromJourneyStep(journeyStep);
  }
  if (search.collected === HERO_ORDER_ID) {
    return "collected";
  }
  if (search.verified === HERO_ORDER_ID) {
    return "verified";
  }
  if (search.arrived === HERO_ORDER_ID) {
    return "arrived";
  }
  return "none";
}

export function getCounterOrders(heroState: CounterHeroState): CounterOrder[] {
  return COUNTER_PREVIEW_ORDERS.flatMap((order) => {
    if (order.id !== HERO_ORDER_ID) {
      return [order];
    }
    if (heroState === "not_yet") {
      return [];
    }
    if (heroState === "none") {
      return [order];
    }

    if (heroState === "arrived") {
      return [
        {
          ...order,
          status: "arrived",
          arrivedAt: "15:52",
          timeline: AMY_ARRIVED_TIMELINE,
          internalNotes: [...order.internalNotes, "Amy arrived at 15:52."],
          recommendedAction: AMY_VERIFY_ACTION,
        },
      ];
    }

    if (heroState === "verified") {
      return [
        {
          ...order,
          status: "verified",
          arrivedAt: "15:52",
          timeline: AMY_VERIFIED_TIMELINE,
          internalNotes: [
            ...order.internalNotes,
            "Amy arrived at 15:52.",
            "Order verified at 15:55.",
          ],
          recommendedAction: AMY_COLLECT_ACTION,
        },
      ];
    }

    return [
      {
        ...order,
        status: "completed",
        arrivedAt: "15:52",
        collectedAt: "15:58",
        timeline: AMY_COLLECTED_TIMELINE,
        internalNotes: [
          ...order.internalNotes,
          "Amy arrived at 15:52.",
          "Order verified at 15:55.",
          "Collected at 15:58.",
        ],
        recommendedAction: AMY_DONE_ACTION,
      },
    ];
  });
}

export function getCounterOrder(
  id: string,
  heroState: CounterHeroState,
): CounterOrder | null {
  return getCounterOrders(heroState).find((order) => order.id === id) ?? null;
}

export function getCounterBoard(orders: CounterOrder[]) {
  return Object.fromEntries(
    COUNTER_BOARD_SECTIONS.map((section) => [
      section.id,
      orders
        .filter((order) => section.statuses.includes(order.status))
        .sort((a, b) => a.collectionSort - b.collectionSort),
    ]),
  ) as Record<(typeof COUNTER_BOARD_SECTIONS)[number]["id"], CounterOrder[]>;
}

function heroQuery(heroState: CounterHeroState): string {
  switch (heroState) {
    case "arrived":
      return "arrived=amy";
    case "verified":
      return "verified=amy";
    case "collected":
      return "collected=amy";
    default:
      return "";
  }
}

export function counterDashboardHref(
  heroState: CounterHeroState,
  journeyStep?: JourneyStep | null,
): string {
  if (journeyStep) {
    return `/preview/collection?step=${journeyStep}`;
  }
  const query = heroQuery(heroState);
  return query ? `/preview/collection?${query}` : "/preview/collection";
}

export function counterOrderHref(
  orderId: string,
  heroState: CounterHeroState,
  journeyStep?: JourneyStep | null,
): string {
  if (journeyStep) {
    return `/preview/collection/orders/${orderId}?step=${journeyStep}`;
  }
  const query = heroQuery(heroState);
  const base = `/preview/collection/orders/${orderId}`;
  return query ? `${base}?${query}` : base;
}

export function counterArriveHref(
  orderId: string,
  journeyStep?: JourneyStep | null,
): string {
  if (journeyStep) {
    return `/preview/collection/orders/${orderId}?step=customer_arrived`;
  }
  return `/preview/collection/orders/${orderId}?arrived=${orderId}`;
}

export function counterVerifyHref(
  orderId: string,
  journeyStep?: JourneyStep | null,
): string {
  const base = `/preview/collection/orders/${orderId}/verify`;
  return journeyStep ? `${base}?step=${journeyStep}` : base;
}

export function counterVerifiedHref(
  orderId: string,
  journeyStep?: JourneyStep | null,
): string {
  if (journeyStep) {
    return `/preview/collection/orders/${orderId}?step=order_verified`;
  }
  return `/preview/collection/orders/${orderId}?verified=${orderId}`;
}

export function counterCollectHref(
  orderId: string,
  journeyStep?: JourneyStep | null,
): string {
  if (journeyStep) {
    return `/preview/collection?step=collected`;
  }
  return `/preview/collection?collected=${orderId}`;
}
