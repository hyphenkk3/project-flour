import type { StatusTone } from "@/lib/design-tokens";
import {
  parseJourneyStep,
  type JourneyStep,
} from "@/workspaces/preview-journey/journey";

export type PreviewCollectionMethod =
  "take_home" | "arrange_transport" | "celebrate_with_us";

export type PreviewStaffCollection = "pickup" | "delivery" | "dine_in";

export type PreviewQueueStatus =
  | "needs_review"
  | "waiting_for_customer"
  | "awaiting_payment"
  | "payment_verification"
  | "ready_for_bakery";

export type PreviewPriorityBadge =
  "today" | "tomorrow" | "first_celebration" | "waiting_reply";

export type PreviewOrderHealth = "healthy" | "waiting" | "needs_attention";

export type PreviewTimelineEvent = {
  id: string;
  time: string;
  title: string;
  detail?: string;
  isCurrent?: boolean;
};

export type PreviewComplimentaryItem = {
  id: string;
  label: string;
  quantity: number;
};

export type PreviewRelationship = {
  celebrationCount: number;
  favouriteCake: string | null;
  lastCelebration: string | null;
};

export type PreviewRecommendedAction = {
  title: string;
  reason: string;
  buttonLabel: string;
};

export type PreviewPaymentSummary = {
  listTotal: number;
  promotionLabel: string;
  promotionAmount: number;
  amountPayable: number;
  received: number;
};

export type PreviewPaymentReceipt = {
  methodLabel: string;
  reference: string;
  amount: number;
  submittedAtLabel: string;
  payerNote: string;
};

export type PreviewHeroState =
  | "none"
  | "summary_sent"
  | "confirmed"
  | "payment_requested"
  | "receipt_submitted"
  | "payment_verified";

export type PreviewOrder = {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  cakeName: string;
  cakeSize: string;
  collectionMethod: PreviewCollectionMethod;
  pickupDateLabel: string;
  pickupWeekday: string;
  pickupTime: string;
  isToday: boolean;
  submittedAt: string;
  status: PreviewQueueStatus;
  health: PreviewOrderHealth;
  badges: PreviewPriorityBadge[];
  customerMessage: string | null;
  complimentaryItems: PreviewComplimentaryItem[];
  totalAmount: number;
  payment: PreviewPaymentSummary | null;
  paymentMessage: string;
  internalNotes: string[];
  timeline: PreviewTimelineEvent[];
  confirmationMessage: string;
  relationship: PreviewRelationship;
  recommendedAction: PreviewRecommendedAction;
};

export const CUSTOMER_COLLECTION_LABEL: Record<
  PreviewCollectionMethod,
  string
> = {
  take_home: "🏠 Take Home",
  arrange_transport: "🚚 Arrange Transport",
  celebrate_with_us: "🍽 Celebrate With Us",
};

export const STAFF_COLLECTION_LABEL: Record<PreviewStaffCollection, string> = {
  pickup: "Pickup",
  delivery: "Delivery",
  dine_in: "Dine-In",
};

export const CUSTOMER_TO_STAFF: Record<
  PreviewCollectionMethod,
  PreviewStaffCollection
> = {
  take_home: "pickup",
  arrange_transport: "delivery",
  celebrate_with_us: "dine_in",
};

export const QUEUE_STATUS_LABEL: Record<PreviewQueueStatus, string> = {
  needs_review: "Needs Review",
  waiting_for_customer: "Waiting for Customer",
  awaiting_payment: "Awaiting Payment",
  payment_verification: "Payment Verification",
  ready_for_bakery: "Ready for Bakery",
};

export const PRIORITY_BADGE_LABEL: Record<PreviewPriorityBadge, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  first_celebration: "✨ First Celebration",
  waiting_reply: "Waiting Reply",
};

export const PRIORITY_BADGE_TONE: Record<PreviewPriorityBadge, StatusTone> = {
  today: "warning",
  tomorrow: "info",
  first_celebration: "success",
  waiting_reply: "neutral",
};

export const QUEUE_STATUS_TONE: Record<PreviewQueueStatus, StatusTone> = {
  needs_review: "info",
  waiting_for_customer: "warning",
  awaiting_payment: "warning",
  payment_verification: "warning",
  ready_for_bakery: "success",
};

export const ORDER_HEALTH_LABEL: Record<PreviewOrderHealth, string> = {
  healthy: "Healthy",
  waiting: "Waiting",
  needs_attention: "Needs Attention",
};

export const ORDER_HEALTH_MARK: Record<PreviewOrderHealth, string> = {
  healthy: "🟢",
  waiting: "🟡",
  needs_attention: "🔴",
};

export const HERO_ORDER_ID = "amy";

const AMY_PENDING_TIMELINE: PreviewTimelineEvent[] = [
  {
    id: "amy-submitted",
    time: "08:12",
    title: "Amy submitted her preorder",
    detail: "Chocolate D’Amour for Friday 21 August, 4:00 PM.",
  },
  {
    id: "amy-opened",
    time: "08:20",
    title: "Vivian opened this celebration",
    detail: "Reviewed the cake, size, and collection details.",
  },
  {
    id: "amy-note",
    time: "08:25",
    title: "Amy asked for less sweet",
    detail: "Noted before the order summary is sent.",
  },
  {
    id: "amy-current",
    time: "Now",
    title: "Waiting for the order summary",
    detail: "Ready to prepare Amy’s confirmation.",
    isCurrent: true,
  },
];

const AMY_WAITING_TIMELINE: PreviewTimelineEvent[] = [
  ...AMY_PENDING_TIMELINE.filter((event) => !event.isCurrent),
  {
    id: "amy-sent",
    time: "08:41",
    title: "Order summary sent",
    detail: "Amy has the details. Waiting for her reply.",
  },
  {
    id: "amy-waiting",
    time: "Now",
    title: "Waiting for Amy to confirm",
    detail: "No further action until she replies.",
    isCurrent: true,
  },
];

const AMY_PAYMENT_TIMELINE: PreviewTimelineEvent[] = [
  ...AMY_WAITING_TIMELINE.filter((event) => !event.isCurrent),
  {
    id: "amy-confirmed",
    time: "09:05",
    title: "Customer confirmed order",
    detail: "Amy confirmed the order summary is correct.",
  },
  {
    id: "amy-payment-ready",
    time: "Now",
    title: "Payment can be requested",
    detail: "Prepare the payment request for Amy.",
    isCurrent: true,
  },
];

const AMY_PAYMENT_SENT_TIMELINE: PreviewTimelineEvent[] = [
  ...AMY_PAYMENT_TIMELINE.filter((event) => !event.isCurrent),
  {
    id: "amy-payment-prepared",
    time: "09:12",
    title: "Payment request prepared",
    detail: "Vivian reviewed the payment message.",
  },
  {
    id: "amy-payment-sent",
    time: "09:14",
    title: "Payment request sent",
    detail: "Amy has the amount payable and QR instructions.",
  },
  {
    id: "amy-awaiting-payment",
    time: "Now",
    title: "Waiting for payment",
    detail: "No further action until Amy pays.",
    isCurrent: true,
  },
];

const AMY_RECEIPT_TIMELINE: PreviewTimelineEvent[] = [
  ...AMY_PAYMENT_SENT_TIMELINE.filter((event) => !event.isCurrent),
  {
    id: "amy-receipt",
    time: "10:18",
    title: "Customer submitted payment receipt",
    detail: "Amy sent a DuitNow receipt for RM105.",
  },
  {
    id: "amy-review-receipt",
    time: "Now",
    title: "Receipt needs review",
    detail: "Check the amount, then verify payment.",
    isCurrent: true,
  },
];

const AMY_VERIFIED_TIMELINE: PreviewTimelineEvent[] = [
  ...AMY_RECEIPT_TIMELINE.filter((event) => !event.isCurrent),
  {
    id: "amy-reviewed",
    time: "10:24",
    title: "Receipt reviewed",
    detail: "Amount matches RM105 payable.",
  },
  {
    id: "amy-verified",
    time: "10:25",
    title: "Payment verified",
    detail: "Payment marked as received.",
  },
  {
    id: "amy-bakery",
    time: "Now",
    title: "Ready for Bakery",
    detail: "No further Customer Operations action.",
    isCurrent: true,
  },
];

const AMY_REVIEW_ACTION: PreviewRecommendedAction = {
  title: "Send Order Summary",
  reason:
    "Amy has submitted a preorder and is awaiting order confirmation before payment can be requested.",
  buttonLabel: "Prepare Order Summary",
};

const AMY_WAITING_ACTION: PreviewRecommendedAction = {
  title: "Wait for Amy to confirm",
  reason:
    "The order summary has been sent. Payment cannot be requested until Amy confirms the details are correct.",
  buttonLabel: "Waiting for Amy",
};

const AMY_SEND_PAYMENT_ACTION: PreviewRecommendedAction = {
  title: "Send Payment Request",
  reason: "Customer has confirmed the order. Payment can now be requested.",
  buttonLabel: "Prepare Payment Request",
};

const AMY_WAIT_PAYMENT_ACTION: PreviewRecommendedAction = {
  title: "Wait for Payment",
  reason: "Payment request has been sent. Waiting for customer payment.",
  buttonLabel: "Waiting for payment",
};

const AMY_REVIEW_RECEIPT_ACTION: PreviewRecommendedAction = {
  title: "Review Payment Receipt",
  reason:
    "Amy submitted a payment receipt. Review it, then verify payment before the Bakery can begin.",
  buttonLabel: "Review receipt",
};

const AMY_READY_BAKERY_ACTION: PreviewRecommendedAction = {
  title: "Ready for Bakery",
  reason:
    "Payment is verified. Customer Operations is done — this celebration is ready for the Bakery.",
  buttonLabel: "Ready for Bakery",
};

const AMY_PAYMENT: PreviewPaymentSummary = {
  listTotal: 125,
  promotionLabel: "August Promotion",
  promotionAmount: 20,
  amountPayable: 105,
  received: 0,
};

export const AMY_PAYMENT_RECEIPT: PreviewPaymentReceipt = {
  methodLabel: "DuitNow",
  reference: "DN-8821-AMY",
  amount: 105,
  submittedAtLabel: "Today · 10:18",
  payerNote: "Amy Chen · Maybank",
};

const AMY_PAYMENT_MESSAGE = `Hi Amy 😊

Thank you for confirming your preorder.

Please find your confirmed order below.

------------------------------------------------

Pickup

Friday

21 Aug

4:00 PM

------------------------------------------------

Chocolate D’Amour

6"

x1

------------------------------------------------

Total

RM125

Promotion

-August Promotion RM20

Amount Payable

RM105

------------------------------------------------

Complimentary

Birthday Topper x1

Knife x1

Candle x1

------------------------------------------------

Please make payment using the QR code below and send us your payment receipt once completed.

Thank you ❤️`;

export const PREVIEW_ORDERS: PreviewOrder[] = [
  {
    id: HERO_ORDER_ID,
    customerName: "Amy Chen",
    customerPhone: "9123 4567",
    customerEmail: "amy.chen@email.com",
    cakeName: "Chocolate D’Amour",
    cakeSize: '6"',
    collectionMethod: "take_home",
    pickupDateLabel: "21 August",
    pickupWeekday: "Friday",
    pickupTime: "4:00 PM",
    isToday: true,
    submittedAt: "08:12",
    status: "needs_review",
    health: "needs_attention",
    badges: ["today", "first_celebration"],
    customerMessage: "Would like less sweet if possible.",
    complimentaryItems: [
      { id: "topper", label: "Birthday Topper", quantity: 1 },
      { id: "knife", label: "Knife", quantity: 1 },
      { id: "candle", label: "Candle", quantity: 1 },
    ],
    totalAmount: 125,
    payment: AMY_PAYMENT,
    paymentMessage: AMY_PAYMENT_MESSAGE,
    internalNotes: [
      "First celebration with Whitebird. Keep the summary warm and clear.",
      "Restate the less-sweet request on the summary.",
    ],
    timeline: AMY_PENDING_TIMELINE,
    confirmationMessage: `Hi Amy 😊

Thank you for your preorder.

Here is your order summary.

Chocolate D’Amour
6"
Take Home
Friday, 21 August · 4:00 PM

We’ll keep it less sweet, as requested.

Complimentary
• Birthday Topper ×1
• Knife ×1
• Candle ×1

Total · RM125
August Promotion · −RM20
Amount payable · RM105

Please let us know if everything looks correct.`,
    relationship: {
      celebrationCount: 0,
      favouriteCake: null,
      lastCelebration: null,
    },
    recommendedAction: AMY_REVIEW_ACTION,
  },
  {
    id: "daniel",
    customerName: "Daniel Lim",
    customerPhone: "8231 4409",
    customerEmail: "daniel.lim@email.com",
    cakeName: "Matcha Caramel Miso",
    cakeSize: '8"',
    collectionMethod: "celebrate_with_us",
    pickupDateLabel: "21 August",
    pickupWeekday: "Friday",
    pickupTime: "3:30 PM",
    isToday: true,
    submittedAt: "07:48",
    status: "needs_review",
    health: "needs_attention",
    badges: ["today"],
    customerMessage: "Celebrating a small team lunch — 10 people.",
    complimentaryItems: [{ id: "plates", label: "Cake plates", quantity: 10 }],
    totalAmount: 88,
    payment: null,
    paymentMessage: "",
    internalNotes: ["Table for 10 at 3:30 PM — check Dine-In capacity."],
    timeline: [
      {
        id: "daniel-submitted",
        time: "07:48",
        title: "Daniel submitted his preorder",
      },
      {
        id: "daniel-current",
        time: "Now",
        title: "Needs review",
        isCurrent: true,
      },
    ],
    confirmationMessage: "",
    relationship: {
      celebrationCount: 4,
      favouriteCake: "Matcha Caramel Miso",
      lastCelebration: "12 June 2026",
    },
    recommendedAction: {
      title: "Review this celebration",
      reason:
        "Daniel’s preorder is in the queue and still needs a human review before an order summary can be sent.",
      buttonLabel: "Review celebration",
    },
  },
  {
    id: "priya",
    customerName: "Priya Nair",
    customerPhone: "9012 7761",
    customerEmail: "priya.nair@email.com",
    cakeName: "Pandan Mango",
    cakeSize: '6"',
    collectionMethod: "take_home",
    pickupDateLabel: "22 August",
    pickupWeekday: "Saturday",
    pickupTime: "11:00 AM",
    isToday: false,
    submittedAt: "Yesterday · 9:14 PM",
    status: "needs_review",
    health: "needs_attention",
    badges: ["tomorrow"],
    customerMessage: null,
    complimentaryItems: [],
    totalAmount: 68,
    payment: null,
    paymentMessage: "",
    internalNotes: [],
    timeline: [
      {
        id: "priya-submitted",
        time: "21:14",
        title: "Priya submitted her preorder",
      },
      {
        id: "priya-current",
        time: "Now",
        title: "Needs review",
        isCurrent: true,
      },
    ],
    confirmationMessage: "",
    relationship: {
      celebrationCount: 2,
      favouriteCake: "Pandan Mango",
      lastCelebration: "3 April 2026",
    },
    recommendedAction: {
      title: "Review this celebration",
      reason:
        "Priya’s Saturday pickup is not confirmed yet. A short review now keeps tomorrow calm.",
      buttonLabel: "Review celebration",
    },
  },
  {
    id: "wei",
    customerName: "Wei Jie Tan",
    customerPhone: "9788 2210",
    customerEmail: "weijie.tan@email.com",
    cakeName: "Earl Grey Pistachio",
    cakeSize: '8"',
    collectionMethod: "arrange_transport",
    pickupDateLabel: "22 August",
    pickupWeekday: "Saturday",
    pickupTime: "2:00 PM",
    isToday: false,
    submittedAt: "Yesterday · 6:02 PM",
    status: "needs_review",
    health: "needs_attention",
    badges: ["tomorrow"],
    customerMessage: "Office at Raffles Place — lobby reception.",
    complimentaryItems: [
      { id: "bag", label: "Insulated carry bag", quantity: 1 },
    ],
    totalAmount: 88,
    payment: null,
    paymentMessage: "",
    internalNotes: ["Delivery window is Saturday afternoon."],
    timeline: [
      {
        id: "wei-submitted",
        time: "18:02",
        title: "Wei Jie submitted his preorder",
      },
      {
        id: "wei-current",
        time: "Now",
        title: "Needs review",
        isCurrent: true,
      },
    ],
    confirmationMessage: "",
    relationship: {
      celebrationCount: 7,
      favouriteCake: "Earl Grey Pistachio",
      lastCelebration: "18 May 2026",
    },
    recommendedAction: {
      title: "Review this celebration",
      reason:
        "Delivery details still need a quick check before the order summary can go out.",
      buttonLabel: "Review celebration",
    },
  },
  {
    id: "sarah",
    customerName: "Sarah Ong",
    customerPhone: "9655 0188",
    customerEmail: "sarah.ong@email.com",
    cakeName: "Salted Chocolate",
    cakeSize: '6"',
    collectionMethod: "take_home",
    pickupDateLabel: "21 August",
    pickupWeekday: "Friday",
    pickupTime: "5:00 PM",
    isToday: true,
    submittedAt: "07:10",
    status: "waiting_for_customer",
    health: "waiting",
    badges: ["today", "waiting_reply"],
    customerMessage: null,
    complimentaryItems: [],
    totalAmount: 68,
    payment: null,
    paymentMessage: "",
    internalNotes: ["Summary sent at 07:22. No reply yet."],
    timeline: [
      {
        id: "sarah-submitted",
        time: "07:10",
        title: "Sarah submitted her preorder",
      },
      {
        id: "sarah-sent",
        time: "07:22",
        title: "Order summary sent",
      },
      {
        id: "sarah-current",
        time: "Now",
        title: "Waiting for Sarah to confirm",
        isCurrent: true,
      },
    ],
    confirmationMessage: "",
    relationship: {
      celebrationCount: 12,
      favouriteCake: "Salted Chocolate",
      lastCelebration: "22 June 2026",
    },
    recommendedAction: {
      title: "Wait for Sarah to confirm",
      reason:
        "Sarah has the order summary. There is nothing to do until she replies — unless today’s 5:00 PM pickup gets close.",
      buttonLabel: "Waiting for Sarah",
    },
  },
  {
    id: "marcus",
    customerName: "Marcus Teo",
    customerPhone: "8330 4412",
    customerEmail: "marcus.teo@email.com",
    cakeName: "Burnt Cheesecake",
    cakeSize: "Whole",
    collectionMethod: "celebrate_with_us",
    pickupDateLabel: "22 August",
    pickupWeekday: "Saturday",
    pickupTime: "12:30 PM",
    isToday: false,
    submittedAt: "Yesterday · 4:40 PM",
    status: "waiting_for_customer",
    health: "healthy",
    badges: ["tomorrow", "waiting_reply"],
    customerMessage: "Can we add a small “Welcome Home” card?",
    complimentaryItems: [
      { id: "card-marcus", label: "Message card — Welcome Home", quantity: 1 },
    ],
    totalAmount: 72,
    payment: null,
    paymentMessage: "",
    internalNotes: ["Waiting on card wording confirmation."],
    timeline: [
      {
        id: "marcus-submitted",
        time: "16:40",
        title: "Marcus submitted his preorder",
      },
      {
        id: "marcus-sent",
        time: "17:05",
        title: "Order summary sent",
      },
      {
        id: "marcus-current",
        time: "Now",
        title: "Waiting for Marcus to confirm",
        isCurrent: true,
      },
    ],
    confirmationMessage: "",
    relationship: {
      celebrationCount: 6,
      favouriteCake: "Burnt Cheesecake",
      lastCelebration: "9 March 2026",
    },
    recommendedAction: {
      title: "Wait for Marcus to confirm",
      reason:
        "Tomorrow’s Dine-In is on track. Marcus still needs to confirm the Welcome Home card wording.",
      buttonLabel: "Waiting for Marcus",
    },
  },
  {
    id: "hui",
    customerName: "Hui Min Koh",
    customerPhone: "9221 6704",
    customerEmail: "huimin.koh@email.com",
    cakeName: "Strawberry Shortcake",
    cakeSize: '8"',
    collectionMethod: "arrange_transport",
    pickupDateLabel: "21 August",
    pickupWeekday: "Friday",
    pickupTime: "4:30 PM",
    isToday: true,
    submittedAt: "06:55",
    status: "waiting_for_customer",
    health: "waiting",
    badges: ["today", "waiting_reply"],
    customerMessage: null,
    complimentaryItems: [],
    totalAmount: 88,
    payment: null,
    paymentMessage: "",
    internalNotes: [],
    timeline: [
      {
        id: "hui-submitted",
        time: "06:55",
        title: "Hui Min submitted her preorder",
      },
      {
        id: "hui-sent",
        time: "07:18",
        title: "Order summary sent",
      },
      {
        id: "hui-current",
        time: "Now",
        title: "Waiting for Hui Min to confirm",
        isCurrent: true,
      },
    ],
    confirmationMessage: "",
    relationship: {
      celebrationCount: 3,
      favouriteCake: "Strawberry Shortcake",
      lastCelebration: "14 February 2026",
    },
    recommendedAction: {
      title: "Wait for Hui Min to confirm",
      reason:
        "The order summary is with Hui Min. Today’s delivery is still a few hours away.",
      buttonLabel: "Waiting for Hui Min",
    },
  },
];

export const STATIC_PRIORITY_COUNTS: Record<
  "awaiting_payment" | "payment_verification" | "ready_for_bakery",
  number
> = {
  awaiting_payment: 5,
  payment_verification: 2,
  ready_for_bakery: 8,
};

export function coHeroFromJourneyStep(step: JourneyStep): PreviewHeroState {
  switch (step) {
    case "summary_sent":
      return "summary_sent";
    case "confirmed":
      return "confirmed";
    case "payment_requested":
      return "payment_requested";
    case "receipt_submitted":
      return "receipt_submitted";
    case "website":
    case "submitted":
      return "none";
    default:
      return "payment_verified";
  }
}

export function parsePreviewHeroState(search: {
  step?: string;
  sent?: string;
  confirmed?: string;
  payment?: string;
  receipt?: string;
  verified?: string;
}): PreviewHeroState {
  const journeyStep = parseJourneyStep(search.step);
  if (journeyStep) {
    return coHeroFromJourneyStep(journeyStep);
  }
  if (search.verified === HERO_ORDER_ID) {
    return "payment_verified";
  }
  if (search.receipt === HERO_ORDER_ID) {
    return "receipt_submitted";
  }
  if (search.payment === HERO_ORDER_ID) {
    return "payment_requested";
  }
  if (search.confirmed === HERO_ORDER_ID) {
    return "confirmed";
  }
  if (search.sent === HERO_ORDER_ID) {
    return "summary_sent";
  }
  return "none";
}

export function getPreviewOrders(heroState: PreviewHeroState): PreviewOrder[] {
  return PREVIEW_ORDERS.map((order) => {
    if (order.id !== HERO_ORDER_ID || heroState === "none") {
      return order;
    }

    if (heroState === "summary_sent") {
      return {
        ...order,
        status: "waiting_for_customer",
        health: "waiting",
        badges: ["today", "waiting_reply"],
        timeline: AMY_WAITING_TIMELINE,
        internalNotes: [
          ...order.internalNotes,
          "Order summary marked as sent at 08:41.",
        ],
        recommendedAction: AMY_WAITING_ACTION,
      };
    }

    if (heroState === "confirmed") {
      return {
        ...order,
        status: "awaiting_payment",
        health: "needs_attention",
        badges: ["today", "first_celebration"],
        timeline: AMY_PAYMENT_TIMELINE,
        internalNotes: [
          ...order.internalNotes,
          "Amy confirmed at 09:05. Payment can be requested.",
        ],
        recommendedAction: AMY_SEND_PAYMENT_ACTION,
      };
    }

    if (heroState === "payment_requested") {
      return {
        ...order,
        status: "awaiting_payment",
        health: "waiting",
        badges: ["today"],
        timeline: AMY_PAYMENT_SENT_TIMELINE,
        internalNotes: [
          ...order.internalNotes,
          "Amy confirmed at 09:05. Payment can be requested.",
          "Payment request marked as sent at 09:14.",
        ],
        recommendedAction: AMY_WAIT_PAYMENT_ACTION,
      };
    }

    if (heroState === "receipt_submitted") {
      return {
        ...order,
        status: "payment_verification",
        health: "needs_attention",
        badges: ["today"],
        timeline: AMY_RECEIPT_TIMELINE,
        internalNotes: [
          ...order.internalNotes,
          "Amy confirmed at 09:05. Payment can be requested.",
          "Payment request marked as sent at 09:14.",
          "Receipt received at 10:18. Verify before Bakery.",
        ],
        recommendedAction: AMY_REVIEW_RECEIPT_ACTION,
      };
    }

    return {
      ...order,
      status: "ready_for_bakery",
      health: "healthy",
      badges: ["today"],
      payment: order.payment
        ? { ...order.payment, received: order.payment.amountPayable }
        : null,
      timeline: AMY_VERIFIED_TIMELINE,
      internalNotes: [
        ...order.internalNotes,
        "Amy confirmed at 09:05. Payment can be requested.",
        "Payment request marked as sent at 09:14.",
        "Receipt received at 10:18. Verify before Bakery.",
        "Payment verified at 10:25. Ready for Bakery.",
      ],
      recommendedAction: AMY_READY_BAKERY_ACTION,
    };
  });
}

export function getPreviewOrder(
  id: string,
  heroState: PreviewHeroState,
): PreviewOrder | null {
  return getPreviewOrders(heroState).find((order) => order.id === id) ?? null;
}

export function getPriorityCounts(orders: PreviewOrder[]) {
  const liveAwaiting = orders.filter(
    (order) => order.status === "awaiting_payment",
  ).length;

  return {
    needs_review: orders.filter((order) => order.status === "needs_review")
      .length,
    waiting_for_customer: orders.filter(
      (order) => order.status === "waiting_for_customer",
    ).length,
    awaiting_payment: STATIC_PRIORITY_COUNTS.awaiting_payment + liveAwaiting,
    payment_verification:
      STATIC_PRIORITY_COUNTS.payment_verification +
      orders.filter((order) => order.status === "payment_verification").length,
    ready_for_bakery:
      STATIC_PRIORITY_COUNTS.ready_for_bakery +
      orders.filter((order) => order.status === "ready_for_bakery").length,
  };
}

export function getWorkQueue(orders: PreviewOrder[]): PreviewOrder[] {
  const rank: Record<PreviewQueueStatus, number> = {
    needs_review: 0,
    waiting_for_customer: 1,
    awaiting_payment: 2,
    payment_verification: 3,
    ready_for_bakery: 4,
  };

  return [...orders]
    .filter(
      (order) =>
        order.status === "needs_review" ||
        order.status === "waiting_for_customer" ||
        (order.status === "awaiting_payment" &&
          order.health === "needs_attention") ||
        order.status === "payment_verification",
    )
    .sort((a, b) => rank[a.status] - rank[b.status]);
}

export function getTodaysSchedule(orders: PreviewOrder[]) {
  const today = orders.filter((order) => order.isToday);

  return {
    pickup: today.filter(
      (order) => CUSTOMER_TO_STAFF[order.collectionMethod] === "pickup",
    ),
    delivery: today.filter(
      (order) => CUSTOMER_TO_STAFF[order.collectionMethod] === "delivery",
    ),
    dine_in: today.filter(
      (order) => CUSTOMER_TO_STAFF[order.collectionMethod] === "dine_in",
    ),
  };
}

function heroQuery(heroState: PreviewHeroState): string {
  switch (heroState) {
    case "summary_sent":
      return "sent=amy";
    case "confirmed":
      return "confirmed=amy";
    case "payment_requested":
      return "payment=amy";
    case "receipt_submitted":
      return "receipt=amy";
    case "payment_verified":
      return "verified=amy";
    default:
      return "";
  }
}

export function previewDashboardHref(
  heroState: PreviewHeroState,
  journeyStep?: JourneyStep | null,
): string {
  if (journeyStep) {
    return `/preview/customer-operations?step=${journeyStep}`;
  }
  const query = heroQuery(heroState);
  return query
    ? `/preview/customer-operations?${query}`
    : "/preview/customer-operations";
}

export function previewOrderHref(
  orderId: string,
  heroState: PreviewHeroState,
  journeyStep?: JourneyStep | null,
): string {
  if (journeyStep) {
    return `/preview/customer-operations/orders/${orderId}?step=${journeyStep}`;
  }
  const query = heroQuery(heroState);
  const base = `/preview/customer-operations/orders/${orderId}`;
  return query ? `${base}?${query}` : base;
}

export function previewConfirmHref(
  orderId: string,
  journeyStep?: JourneyStep | null,
): string {
  const base = `/preview/customer-operations/orders/${orderId}/confirm`;
  return journeyStep ? `${base}?step=${journeyStep}` : base;
}

export function previewPaymentHref(
  orderId: string,
  journeyStep?: JourneyStep | null,
): string {
  const base = `/preview/customer-operations/orders/${orderId}/payment`;
  return journeyStep ? `${base}?step=${journeyStep}` : base;
}

export function previewCustomerConfirmedHref(
  orderId: string,
  journeyStep?: JourneyStep | null,
): string {
  if (journeyStep) {
    return `/preview/customer-operations/orders/${orderId}?step=confirmed`;
  }
  return `/preview/customer-operations/orders/${orderId}?confirmed=${orderId}`;
}

export function previewReceiptHref(
  orderId: string,
  journeyStep?: JourneyStep | null,
): string {
  const base = `/preview/customer-operations/orders/${orderId}/receipt`;
  return journeyStep ? `${base}?step=${journeyStep}` : base;
}

export function previewReceiptSubmittedHref(
  orderId: string,
  journeyStep?: JourneyStep | null,
): string {
  if (journeyStep) {
    return `/preview/customer-operations/orders/${orderId}?step=receipt_submitted`;
  }
  return `/preview/customer-operations/orders/${orderId}?receipt=${orderId}`;
}

export function formatPreviewPrice(amount: number): string {
  return `RM${amount}`;
}

export function relationshipSummary(relationship: PreviewRelationship): string {
  if (relationship.celebrationCount === 0) {
    return "✨ First Celebration";
  }

  return `Celebrated with Whitebird ${relationship.celebrationCount} times`;
}
