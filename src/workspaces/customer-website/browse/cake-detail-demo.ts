import {
  AVAILABLE_NOW_CAKES,
  WHITEBIRD_CLASSICS,
  type BrowseCake,
} from "@/workspaces/customer-website/browse/cakes-demo";

export type CakeDetailBadge = "less_sweet" | "bestseller" | "seasonal";

export type CakeSizeOption = {
  id: string;
  label: string;
  serves: string;
  priceRm: number;
};

export type CakeDetail = BrowseCake & {
  story: string;
  flavourProfile: string;
  flavourNotes: string[];
  badges: CakeDetailBadge[];
  sizes: CakeSizeOption[];
  availableThisMonth: boolean;
  nextCollectionLabel: string;
  nextCollectionNote: string;
};

export const CAKE_DETAIL_BADGE_LABEL: Record<CakeDetailBadge, string> = {
  less_sweet: "Less Sweet",
  bestseller: "Bestseller",
  seasonal: "Seasonal",
};

const DEFAULT_SIZES: CakeSizeOption[] = [
  {
    id: "6-inch",
    label: "6 inch",
    serves: "Serves 6–8",
    priceRm: 68,
  },
  {
    id: "8-inch",
    label: "8 inch",
    serves: "Serves 10–12",
    priceRm: 88,
  },
  {
    id: "10-inch",
    label: "10 inch",
    serves: "Serves 14–18",
    priceRm: 118,
  },
];

type CakeDetailFields = Omit<
  CakeDetail,
  keyof BrowseCake | "availableThisMonth" | "sizes"
> & {
  sizes?: CakeSizeOption[];
  availableThisMonth?: boolean;
};

/**
 * Detail copy keyed by browse cake id.
 * Mock only — not inventory or order-system truth.
 */
const DETAIL_BY_ID: Record<string, CakeDetailFields> = {
  "chocolate-damour": {
    story:
      "A quieter chocolate cake for people who want richness without the sugar rush. Soft cocoa sponge, a salted caramel heart, and a finish that feels like a celebration rather than a shout.",
    flavourProfile: "Deep cocoa · salted caramel · soft bitterness",
    flavourNotes: ["Cocoa", "Salted caramel", "Gentle bitterness"],
    badges: ["less_sweet", "bestseller"],
    nextCollectionLabel: "Friday, 21 August",
    nextCollectionNote: "Earliest collection for this cake.",
    sizes: [
      {
        id: "6-inch",
        label: "6 inch",
        serves: "Serves 6–8",
        priceRm: 125,
      },
      {
        id: "8-inch",
        label: "8 inch",
        serves: "Serves 10–12",
        priceRm: 155,
      },
      {
        id: "10-inch",
        label: "10 inch",
        serves: "Serves 14–18",
        priceRm: 185,
      },
    ],
  },
  "salted-chocolate": {
    story:
      "A celebration cake for people who love chocolate without the sugar rush. Soft cocoa sponge, a salted caramel heart, and a finish that feels quiet rather than loud.",
    flavourProfile: "Deep cocoa · salted caramel · soft bitterness",
    flavourNotes: ["Cocoa", "Salted caramel", "Gentle bitterness"],
    badges: ["less_sweet", "bestseller"],
    nextCollectionLabel: "Saturday, 8 August",
    nextCollectionNote: "Earliest collection for this cake.",
  },
  "matcha-caramel-miso": {
    story:
      "Earthy matcha meets a savoury-sweet caramel. Guests often pause after the first bite — it is familiar and unexpected at once.",
    flavourProfile: "Matcha · caramel · soft miso warmth",
    flavourNotes: ["Matcha", "Caramel", "Miso"],
    badges: ["less_sweet", "seasonal"],
    nextCollectionLabel: "Sunday, 9 August",
    nextCollectionNote: "Earliest collection for this cake.",
  },
  "earl-grey-pistachio": {
    story:
      "Bergamot cream folded through pistachio sponge — fragrant, pale green, and made for afternoon celebrations.",
    flavourProfile: "Earl Grey · pistachio · soft cream",
    flavourNotes: ["Earl Grey", "Pistachio", "Cream"],
    badges: ["less_sweet"],
    nextCollectionLabel: "Saturday, 8 August",
    nextCollectionNote: "Earliest collection for this cake.",
  },
  "pandan-mango": {
    story:
      "Fragrant pandan chiffon with ripe mango cream. A tropical cake that still feels light enough for warm Singapore days.",
    flavourProfile: "Pandan · mango · soft chiffon",
    flavourNotes: ["Pandan", "Mango", "Chiffon"],
    badges: ["bestseller", "seasonal"],
    nextCollectionLabel: "Friday, 7 August",
    nextCollectionNote: "Earliest collection for this cake.",
  },
  "matcha-passion-fruit": {
    story:
      "Bright passion fruit cutting through soft matcha layers. Chosen when you want something refreshing on the table.",
    flavourProfile: "Matcha · passion fruit · light acidity",
    flavourNotes: ["Matcha", "Passion fruit", "Light cream"],
    badges: ["less_sweet", "seasonal"],
    nextCollectionLabel: "Saturday, 8 August",
    nextCollectionNote: "Earliest collection for this cake.",
  },
  "burnt-cheesecake": {
    story:
      "Basque-style, caramelised on top, custardy in the centre. Not iced theatre — just a confident, shareable cake.",
    flavourProfile: "Caramelised cream · vanilla · gentle tang",
    flavourNotes: ["Burnt cream", "Vanilla", "Soft tang"],
    badges: ["bestseller", "less_sweet"],
    nextCollectionLabel: "Thursday, 6 August",
    nextCollectionNote: "Earliest collection for this cake.",
    sizes: [
      {
        id: "whole",
        label: "Whole",
        serves: "Serves 8–10",
        priceRm: 72,
      },
      {
        id: "large",
        label: "Large",
        serves: "Serves 12–14",
        priceRm: 96,
      },
    ],
  },
  "yuzu-white-chocolate": {
    story:
      "Citrus lift over a quiet white chocolate mousse. Soft, pale, and often chosen for intimate dinners.",
    flavourProfile: "Yuzu · white chocolate · soft cream",
    flavourNotes: ["Yuzu", "White chocolate", "Mousse"],
    badges: ["less_sweet", "seasonal"],
    nextCollectionLabel: "Sunday, 9 August",
    nextCollectionNote: "Earliest collection for this cake.",
  },
  "coconut-gula-melaka": {
    story:
      "Toasted coconut and palm sugar in soft chiffon. A flavour many Singapore families recognise instantly.",
    flavourProfile: "Coconut · gula melaka · soft sponge",
    flavourNotes: ["Coconut", "Gula melaka", "Chiffon"],
    badges: ["bestseller"],
    nextCollectionLabel: "Saturday, 8 August",
    nextCollectionNote: "Earliest collection for this cake.",
  },
  "dark-cherry-cocoa": {
    story:
      "Bittersweet cocoa with a cherry conserve centre. For celebrations that want depth more than sweetness.",
    flavourProfile: "Dark cocoa · cherry · soft bitterness",
    flavourNotes: ["Cocoa", "Cherry", "Dark chocolate"],
    badges: ["less_sweet"],
    nextCollectionLabel: "Friday, 7 August",
    nextCollectionNote: "Earliest collection for this cake.",
  },
  "lemon-olive-oil": {
    story:
      "Tender crumb, bright lemon, a touch of olive oil. Simple on the plate — memorable at the table.",
    flavourProfile: "Lemon · olive oil · soft crumb",
    flavourNotes: ["Lemon", "Olive oil", "Tender crumb"],
    badges: ["less_sweet", "seasonal"],
    nextCollectionLabel: "Saturday, 8 August",
    nextCollectionNote: "Earliest collection for this cake.",
  },
  "tiramisu-opera": {
    story:
      "Espresso-soaked layers with mascarpone silk. A grown-up celebration cake that still feels generous.",
    flavourProfile: "Espresso · mascarpone · cocoa dust",
    flavourNotes: ["Espresso", "Mascarpone", "Cocoa"],
    badges: ["bestseller"],
    nextCollectionLabel: "Sunday, 9 August",
    nextCollectionNote: "Earliest collection for this cake.",
  },
  "strawberry-shortcake": {
    story:
      "Soft sponge, whipped cream, and ripe strawberries. The cake people return to when they want something familiar and kind.",
    flavourProfile: "Strawberry · cream · soft sponge",
    flavourNotes: ["Strawberry", "Cream", "Sponge"],
    badges: ["bestseller"],
    nextCollectionLabel: "Friday, 7 August",
    nextCollectionNote: "Earliest collection for this cake.",
  },
  "mandarin-symphony": {
    story:
      "Mandarin blossom cream and soft sponge — a house favourite from seasons past. Guests still ask for it by memory.",
    flavourProfile: "Mandarin · blossom cream · soft sponge",
    flavourNotes: ["Mandarin", "Blossom cream", "Sponge"],
    badges: ["bestseller"],
    nextCollectionLabel: "Not scheduled this month",
    nextCollectionNote:
      "A Whitebird Classic — not baking in the current collection window.",
  },
  "strawberry-matcha": {
    story:
      "Matcha chiffon with strawberries at their peak. Quiet, green, and often remembered as a spring celebration cake.",
    flavourProfile: "Matcha · strawberry · soft chiffon",
    flavourNotes: ["Matcha", "Strawberry", "Chiffon"],
    badges: ["less_sweet", "seasonal"],
    nextCollectionLabel: "Not scheduled this month",
    nextCollectionNote:
      "A Whitebird Classic — not baking in the current collection window.",
  },
  "black-sesame": {
    story:
      "Toasted black sesame cream — nutty, gentle, unmistakably Whitebird. A classic for guests who prefer less sweetness.",
    flavourProfile: "Black sesame · toasted nut · soft cream",
    flavourNotes: ["Black sesame", "Toasted nut", "Cream"],
    badges: ["less_sweet", "bestseller"],
    nextCollectionLabel: "Not scheduled this month",
    nextCollectionNote:
      "A Whitebird Classic — not baking in the current collection window.",
  },
  "hojicha-strawberry": {
    story:
      "Roasted tea warmth against soft strawberry. A seasonal memory more than a permanent menu item.",
    flavourProfile: "Hojicha · strawberry · roasted tea",
    flavourNotes: ["Hojicha", "Strawberry", "Roasted tea"],
    badges: ["seasonal", "less_sweet"],
    nextCollectionLabel: "Not scheduled this month",
    nextCollectionNote:
      "A Whitebird Classic — not baking in the current collection window.",
  },
  "lychee-rose": {
    story:
      "Floral and delicate — the cake guests still ask for by name long after the season ends.",
    flavourProfile: "Lychee · rose · soft cream",
    flavourNotes: ["Lychee", "Rose", "Cream"],
    badges: ["seasonal"],
    nextCollectionLabel: "Not scheduled this month",
    nextCollectionNote:
      "A Whitebird Classic — not baking in the current collection window.",
  },
  "chestnut-mont-blanc": {
    story:
      "Sweet chestnut cream piped with quiet care. Winter’s classic — rich without feeling heavy.",
    flavourProfile: "Chestnut · soft cream · gentle sweetness",
    flavourNotes: ["Chestnut", "Cream", "Soft sweetness"],
    badges: ["seasonal", "less_sweet"],
    nextCollectionLabel: "Not scheduled this month",
    nextCollectionNote:
      "A Whitebird Classic — not baking in the current collection window.",
  },
};

const ALL_BROWSE_CAKES: BrowseCake[] = [
  ...AVAILABLE_NOW_CAKES,
  ...WHITEBIRD_CLASSICS,
];

export function getAllCakeIds(): string[] {
  return ALL_BROWSE_CAKES.map((cake) => cake.id);
}

export function getCakeDetail(id: string): CakeDetail | null {
  const browse = ALL_BROWSE_CAKES.find((cake) => cake.id === id);
  const detail = DETAIL_BY_ID[id];
  if (!browse || !detail) {
    return null;
  }

  return {
    ...browse,
    ...detail,
    sizes: detail.sizes ?? DEFAULT_SIZES,
    availableThisMonth:
      detail.availableThisMonth ?? browse.section === "available_now",
  };
}

export function formatCakePrice(amount: number): string {
  return `RM${amount}`;
}
