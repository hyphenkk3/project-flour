import type { StatusTone } from "@/lib/design-tokens";
import {
  parseJourneyStep,
  type JourneyStep,
} from "@/workspaces/preview-journey/journey";

export type BakeryCollectionMethod = "pickup" | "delivery" | "dine_in";

export type BakeryStatus =
  "ready_to_start" | "in_production" | "ready_for_counter";

export type BakeryHeroState =
  "none" | "started" | "ready" | "accepted" | "not_yet";

export type BakeryTimelineEvent = {
  id: string;
  time: string;
  title: string;
  detail?: string;
  isCurrent?: boolean;
};

export type BakeryRecommendedAction = {
  title: string;
  reason: string;
  buttonLabel: string;
};

export type BakeryOrder = {
  id: string;
  guestLabel: string;
  cakeName: string;
  cakeSize: string;
  flavour: string;
  decoration: string;
  collectionDateLabel: string;
  collectionWeekday: string;
  collectionTime: string;
  collectionSort: number;
  collectionMethod: BakeryCollectionMethod;
  specialNotes: string | null;
  packingItems: string[];
  internalNotes: string[];
  timeline: BakeryTimelineEvent[];
  status: BakeryStatus;
  startedAt: string | null;
  readyAt: string | null;
  recommendedAction: BakeryRecommendedAction;
};

export const BAKERY_COLLECTION_LABEL: Record<BakeryCollectionMethod, string> = {
  pickup: "Pickup",
  delivery: "Delivery",
  dine_in: "Dine-In",
};

export const BAKERY_STATUS_LABEL: Record<BakeryStatus, string> = {
  ready_to_start: "Ready to Start",
  in_production: "In Production",
  ready_for_counter: "Ready for Counter",
};

export const BAKERY_STATUS_TONE: Record<BakeryStatus, StatusTone> = {
  ready_to_start: "info",
  in_production: "warning",
  ready_for_counter: "success",
};

export const BAKERY_BOARD_SECTIONS: BakeryStatus[] = [
  "ready_to_start",
  "in_production",
  "ready_for_counter",
];

const HERO_ORDER_ID = "amy";

const AMY_START_ACTION: BakeryRecommendedAction = {
  title: "Start Production",
  reason:
    "Payment is verified. This cake is on today’s list and has not been started.",
  buttonLabel: "Start Production",
};

const AMY_MARK_READY_ACTION: BakeryRecommendedAction = {
  title: "Mark Ready",
  reason:
    "This cake is on the bench. Check packing, then mark ready when it can leave the Bakery.",
  buttonLabel: "Mark Ready",
};

const AMY_COUNTER_ACTION: BakeryRecommendedAction = {
  title: "Ready for Counter",
  reason:
    "Production is complete. Bakery is done — Counter will handle collection.",
  buttonLabel: "Ready for Counter",
};

const AMY_READY_TIMELINE: BakeryTimelineEvent[] = [
  {
    id: "amy-verified",
    time: "10:25",
    title: "Ready for Bakery",
    detail: "Payment verified by Customer Operations.",
  },
  {
    id: "amy-queue",
    time: "Now",
    title: "Waiting to start",
    detail: "On today’s production list.",
    isCurrent: true,
  },
];

const AMY_STARTED_TIMELINE: BakeryTimelineEvent[] = [
  ...AMY_READY_TIMELINE.filter((event) => !event.isCurrent),
  {
    id: "amy-started",
    time: "11:02",
    title: "Production started",
    detail: 'Chocolate D’Amour 6" on the bench.',
  },
  {
    id: "amy-in-prod",
    time: "Now",
    title: "In production",
    detail: "Keep less sweet. Stage topper last.",
    isCurrent: true,
  },
];

const AMY_DONE_TIMELINE: BakeryTimelineEvent[] = [
  ...AMY_STARTED_TIMELINE.filter((event) => !event.isCurrent),
  {
    id: "amy-finished",
    time: "14:40",
    title: "Marked ready",
    detail: "Finished and staged for collection.",
  },
  {
    id: "amy-counter",
    time: "Now",
    title: "Ready for Counter",
    detail: "No further Bakery action.",
    isCurrent: true,
  },
];

export const BAKERY_PREVIEW_ORDERS: BakeryOrder[] = [
  {
    id: HERO_ORDER_ID,
    guestLabel: "Amy Chen",
    cakeName: "Chocolate D’Amour",
    cakeSize: '6"',
    flavour: "Deep cocoa · salted caramel",
    decoration: "Birthday topper",
    collectionDateLabel: "21 August",
    collectionWeekday: "Friday",
    collectionTime: "4:00 PM",
    collectionSort: 16 * 60,
    collectionMethod: "pickup",
    specialNotes: "Less sweet",
    packingItems: ["Knife", "Candle", "Birthday Topper", "Birthday Card"],
    internalNotes: [
      "Payment verified at 10:25. Ready for Bakery.",
      "Keep less sweet, as requested.",
    ],
    timeline: AMY_READY_TIMELINE,
    status: "ready_to_start",
    startedAt: null,
    readyAt: null,
    recommendedAction: AMY_START_ACTION,
  },
  {
    id: "farah",
    guestLabel: "Farah Ismail",
    cakeName: "Burnt Cheesecake",
    cakeSize: '8"',
    flavour: "Basque · custard centre",
    decoration: "None",
    collectionDateLabel: "21 August",
    collectionWeekday: "Friday",
    collectionTime: "2:00 PM",
    collectionSort: 14 * 60,
    collectionMethod: "dine_in",
    specialNotes: null,
    packingItems: [],
    internalNotes: ["No decoration. Serve as baked."],
    timeline: [
      {
        id: "farah-queue",
        time: "Now",
        title: "Waiting to start",
        detail: "On today’s production list.",
        isCurrent: true,
      },
    ],
    status: "ready_to_start",
    startedAt: null,
    readyAt: null,
    recommendedAction: {
      title: "Start Production",
      reason: "This cake is on today’s list and has not been started.",
      buttonLabel: "Start Production",
    },
  },
  {
    id: "jason",
    guestLabel: "Jason Ong",
    cakeName: "Matcha Passion Fruit",
    cakeSize: '6"',
    flavour: "Matcha · passion fruit",
    decoration: "Passion glaze",
    collectionDateLabel: "21 August",
    collectionWeekday: "Friday",
    collectionTime: "5:30 PM",
    collectionSort: 17 * 60 + 30,
    collectionMethod: "delivery",
    specialNotes: null,
    packingItems: ["Box"],
    internalNotes: ["Glaze after chill."],
    timeline: [
      {
        id: "jason-queue",
        time: "Now",
        title: "Waiting to start",
        detail: "On today’s production list.",
        isCurrent: true,
      },
    ],
    status: "ready_to_start",
    startedAt: null,
    readyAt: null,
    recommendedAction: {
      title: "Start Production",
      reason: "This cake is on today’s list and has not been started.",
      buttonLabel: "Start Production",
    },
  },
  {
    id: "sarah",
    guestLabel: "Sarah Ong",
    cakeName: "Salted Chocolate",
    cakeSize: '6"',
    flavour: "Cocoa · salted caramel heart",
    decoration: "Gold leaf",
    collectionDateLabel: "21 August",
    collectionWeekday: "Friday",
    collectionTime: "5:00 PM",
    collectionSort: 17 * 60,
    collectionMethod: "pickup",
    specialNotes: null,
    packingItems: ["Knife", "Box"],
    internalNotes: ["Started at 07:40. Gold leaf after set."],
    timeline: [
      {
        id: "sarah-start",
        time: "07:40",
        title: "Production started",
      },
      {
        id: "sarah-now",
        time: "Now",
        title: "In production",
        detail: "Caramel heart set. Finish with gold leaf.",
        isCurrent: true,
      },
    ],
    status: "in_production",
    startedAt: "07:40",
    readyAt: null,
    recommendedAction: {
      title: "Mark Ready",
      reason:
        "This cake is on the bench. Mark ready when finishing is done and it can leave the Bakery.",
      buttonLabel: "Mark Ready",
    },
  },
  {
    id: "huimin",
    guestLabel: "Hui Min Koh",
    cakeName: "Strawberry Shortcake",
    cakeSize: '8"',
    flavour: "Fresh cream · strawberry",
    decoration: "Strawberry crown",
    collectionDateLabel: "21 August",
    collectionWeekday: "Friday",
    collectionTime: "4:30 PM",
    collectionSort: 16 * 60 + 30,
    collectionMethod: "delivery",
    specialNotes: "No cream on the cut face",
    packingItems: ["Box"],
    internalNotes: ["Started at 08:10. Crown just before staging."],
    timeline: [
      {
        id: "huimin-start",
        time: "08:10",
        title: "Production started",
      },
      {
        id: "huimin-now",
        time: "Now",
        title: "In production",
        detail: "Chilling before crown.",
        isCurrent: true,
      },
    ],
    status: "in_production",
    startedAt: "08:10",
    readyAt: null,
    recommendedAction: {
      title: "Mark Ready",
      reason:
        "This cake is on the bench. Mark ready when finishing is done and it can leave the Bakery.",
      buttonLabel: "Mark Ready",
    },
  },
  {
    id: "daniel",
    guestLabel: "Daniel Lim",
    cakeName: "Matcha Caramel Miso",
    cakeSize: '8"',
    flavour: "Matcha · caramel · miso",
    decoration: "Minimal",
    collectionDateLabel: "21 August",
    collectionWeekday: "Friday",
    collectionTime: "3:30 PM",
    collectionSort: 15 * 60 + 30,
    collectionMethod: "dine_in",
    specialNotes: null,
    packingItems: [],
    internalNotes: ["Started at 08:25. Dine-In — no box."],
    timeline: [
      {
        id: "daniel-start",
        time: "08:25",
        title: "Production started",
      },
      {
        id: "daniel-now",
        time: "Now",
        title: "In production",
        detail: "Layers stacked. Light finish only.",
        isCurrent: true,
      },
    ],
    status: "in_production",
    startedAt: "08:25",
    readyAt: null,
    recommendedAction: {
      title: "Mark Ready",
      reason:
        "This cake is on the bench. Mark ready when finishing is done and it can leave the Bakery.",
      buttonLabel: "Mark Ready",
    },
  },
  {
    id: "meiling",
    guestLabel: "Mei Ling Tan",
    cakeName: "Earl Grey Pistachio",
    cakeSize: '6"',
    flavour: "Bergamot · pistachio",
    decoration: "Pistachio shards",
    collectionDateLabel: "21 August",
    collectionWeekday: "Friday",
    collectionTime: "12:30 PM",
    collectionSort: 12 * 60 + 30,
    collectionMethod: "pickup",
    specialNotes: null,
    packingItems: ["Knife", "Box"],
    internalNotes: ["Marked ready at 10:05. Staged in chiller A."],
    timeline: [
      {
        id: "meiling-start",
        time: "07:15",
        title: "Production started",
      },
      {
        id: "meiling-ready",
        time: "10:05",
        title: "Marked ready",
      },
      {
        id: "meiling-now",
        time: "Now",
        title: "Ready for Counter",
        detail: "No further Bakery action.",
        isCurrent: true,
      },
    ],
    status: "ready_for_counter",
    startedAt: "07:15",
    readyAt: "10:05",
    recommendedAction: {
      title: "Ready for Counter",
      reason:
        "Production is complete. Bakery is done — Counter will handle collection.",
      buttonLabel: "Ready for Counter",
    },
  },
  {
    id: "kenji",
    guestLabel: "Kenji Sato",
    cakeName: "Yuzu White Chocolate",
    cakeSize: '6"',
    flavour: "Yuzu · white chocolate",
    decoration: "Candied peel",
    collectionDateLabel: "21 August",
    collectionWeekday: "Friday",
    collectionTime: "1:00 PM",
    collectionSort: 13 * 60,
    collectionMethod: "pickup",
    specialNotes: null,
    packingItems: ["Knife", "Box"],
    internalNotes: ["Marked ready at 10:20. Staged in chiller A."],
    timeline: [
      {
        id: "kenji-start",
        time: "07:20",
        title: "Production started",
      },
      {
        id: "kenji-ready",
        time: "10:20",
        title: "Marked ready",
      },
      {
        id: "kenji-now",
        time: "Now",
        title: "Ready for Counter",
        detail: "No further Bakery action.",
        isCurrent: true,
      },
    ],
    status: "ready_for_counter",
    startedAt: "07:20",
    readyAt: "10:20",
    recommendedAction: {
      title: "Ready for Counter",
      reason:
        "Production is complete. Bakery is done — Counter will handle collection.",
      buttonLabel: "Ready for Counter",
    },
  },
];

export function bakeryHeroFromJourneyStep(step: JourneyStep): BakeryHeroState {
  switch (step) {
    case "payment_verified":
      return "none";
    case "production_started":
      return "started";
    case "ready_for_collection":
      return "ready";
    case "customer_arrived":
    case "order_verified":
    case "collected":
      return "accepted";
    default:
      return "not_yet";
  }
}

export function parseBakeryHeroState(search: {
  step?: string;
  started?: string;
  ready?: string;
  accepted?: string;
}): BakeryHeroState {
  const journeyStep = parseJourneyStep(search.step);
  if (journeyStep) {
    return bakeryHeroFromJourneyStep(journeyStep);
  }
  if (search.accepted === HERO_ORDER_ID) {
    return "accepted";
  }
  if (search.ready === HERO_ORDER_ID) {
    return "ready";
  }
  if (search.started === HERO_ORDER_ID) {
    return "started";
  }
  return "none";
}

export function getBakeryOrders(heroState: BakeryHeroState): BakeryOrder[] {
  return BAKERY_PREVIEW_ORDERS.flatMap((order) => {
    if (order.id !== HERO_ORDER_ID) {
      return [order];
    }
    if (heroState === "accepted" || heroState === "not_yet") {
      return [];
    }
    if (heroState === "none") {
      return [order];
    }

    if (heroState === "started") {
      return [
        {
          ...order,
          status: "in_production",
          startedAt: "11:02",
          timeline: AMY_STARTED_TIMELINE,
          internalNotes: [
            ...order.internalNotes,
            "Production started at 11:02.",
          ],
          recommendedAction: AMY_MARK_READY_ACTION,
        },
      ];
    }

    return [
      {
        ...order,
        status: "ready_for_counter",
        startedAt: "11:02",
        readyAt: "14:40",
        timeline: AMY_DONE_TIMELINE,
        internalNotes: [
          ...order.internalNotes,
          "Production started at 11:02.",
          "Marked ready at 14:40. Staged for Collection.",
        ],
        recommendedAction: AMY_COUNTER_ACTION,
      },
    ];
  });
}

export function getBakeryOrder(
  id: string,
  heroState: BakeryHeroState,
): BakeryOrder | null {
  return getBakeryOrders(heroState).find((order) => order.id === id) ?? null;
}

export function getBakeryBoard(orders: BakeryOrder[]) {
  const byStatus = (status: BakeryStatus) =>
    orders
      .filter((order) => order.status === status)
      .sort((a, b) => a.collectionSort - b.collectionSort);

  return {
    ready_to_start: byStatus("ready_to_start"),
    in_production: byStatus("in_production"),
    ready_for_counter: byStatus("ready_for_counter"),
  };
}

function heroQuery(heroState: BakeryHeroState): string {
  switch (heroState) {
    case "started":
      return "started=amy";
    case "ready":
      return "ready=amy";
    case "accepted":
      return "accepted=amy";
    default:
      return "";
  }
}

export function bakeryDashboardHref(
  heroState: BakeryHeroState,
  journeyStep?: JourneyStep | null,
): string {
  if (journeyStep) {
    return `/preview/bakery?step=${journeyStep}`;
  }
  const query = heroQuery(heroState);
  return query ? `/preview/bakery?${query}` : "/preview/bakery";
}

export function bakeryOrderHref(
  orderId: string,
  heroState: BakeryHeroState,
  journeyStep?: JourneyStep | null,
): string {
  if (journeyStep) {
    return `/preview/bakery/orders/${orderId}?step=${journeyStep}`;
  }
  const query = heroQuery(heroState);
  const base = `/preview/bakery/orders/${orderId}`;
  return query ? `${base}?${query}` : base;
}

export function bakeryStartHref(
  orderId: string,
  journeyStep?: JourneyStep | null,
): string {
  if (journeyStep) {
    return `/preview/bakery/orders/${orderId}?step=production_started`;
  }
  return `/preview/bakery/orders/${orderId}?started=${orderId}`;
}

export function bakeryMarkReadyHref(
  orderId: string,
  journeyStep?: JourneyStep | null,
): string {
  if (journeyStep) {
    return `/preview/bakery/orders/${orderId}?step=ready_for_collection`;
  }
  return `/preview/bakery/orders/${orderId}?ready=${orderId}`;
}
