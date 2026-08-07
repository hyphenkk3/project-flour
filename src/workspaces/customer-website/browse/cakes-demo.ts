export type BrowseCakeSection = "available_now" | "classics";

export type BrowseCake = {
  id: string;
  name: string;
  description: string;
  section: BrowseCakeSection;
  /** Hero image URL (mock CDN). */
  imageUrl: string;
  imageAlt: string;
};

/**
 * Mock catalogue for V0.4-P2 Browse Cakes.
 * Inspiration only — not connected to inventory or ordering.
 */
export const AVAILABLE_NOW_CAKES: BrowseCake[] = [
  {
    id: "chocolate-damour",
    name: "Chocolate D’Amour",
    description: "Deep cocoa sponge with a quiet salted caramel heart.",
    section: "available_now",
    imageUrl:
      "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Chocolate celebration cake",
  },
  {
    id: "salted-chocolate",
    name: "Salted Chocolate",
    description: "Deep cocoa layers with a soft salted caramel heart.",
    section: "available_now",
    imageUrl:
      "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Chocolate layer cake with rich frosting",
  },
  {
    id: "matcha-caramel-miso",
    name: "Matcha Caramel Miso",
    description: "Earthy matcha balanced with savoury-sweet caramel.",
    section: "available_now",
    imageUrl:
      "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Green matcha cake on a plate",
  },
  {
    id: "earl-grey-pistachio",
    name: "Earl Grey Pistachio",
    description: "Bergamot cream folded through pistachio sponge.",
    section: "available_now",
    imageUrl:
      "https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Elegant frosted celebration cake",
  },
  {
    id: "pandan-mango",
    name: "Pandan Mango",
    description: "Fragrant pandan chiffon with ripe mango cream.",
    section: "available_now",
    imageUrl:
      "https://images.unsplash.com/photo-1621303837174-89787a7d4729?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Yellow mango cake with cream",
  },
  {
    id: "matcha-passion-fruit",
    name: "Matcha Passion Fruit",
    description: "Bright passion fruit cut through soft matcha layers.",
    section: "available_now",
    imageUrl:
      "https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Cake with fruit topping",
  },
  {
    id: "burnt-cheesecake",
    name: "Burnt Cheesecake",
    description: "Basque-style, caramelised top, custardy centre.",
    section: "available_now",
    imageUrl:
      "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Burnt cheesecake with golden top",
  },
  {
    id: "yuzu-white-chocolate",
    name: "Yuzu White Chocolate",
    description: "Citrus lift over a quiet white chocolate mousse.",
    section: "available_now",
    imageUrl:
      "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "White cream cake dessert",
  },
  {
    id: "coconut-gula-melaka",
    name: "Coconut Gula Melaka",
    description: "Toasted coconut and palm sugar in soft chiffon.",
    section: "available_now",
    imageUrl:
      "https://images.unsplash.com/photo-1558301211-0d8c8ddee6ec?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Light coconut-style layer cake",
  },
  {
    id: "dark-cherry-cocoa",
    name: "Dark Cherry Cocoa",
    description: "Bittersweet cocoa with a cherry conserve centre.",
    section: "available_now",
    imageUrl:
      "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Chocolate cake with berries",
  },
  {
    id: "lemon-olive-oil",
    name: "Lemon Olive Oil",
    description: "Tender crumb, bright lemon, a touch of olive oil.",
    section: "available_now",
    imageUrl:
      "https://images.unsplash.com/photo-1519915028121-7d3463d20b13?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Lemon cake slice",
  },
  {
    id: "tiramisu-opera",
    name: "Tiramisu Opera",
    description: "Espresso-soaked layers with mascarpone silk.",
    section: "available_now",
    imageUrl:
      "https://images.unsplash.com/photo-1571115177098-24ec42ed204d?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Coffee cream layered cake",
  },
  {
    id: "strawberry-shortcake",
    name: "Strawberry Shortcake",
    description: "Soft sponge, whipped cream, and ripe strawberries.",
    section: "available_now",
    imageUrl:
      "https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Strawberry cream cake",
  },
];

export const WHITEBIRD_CLASSICS: BrowseCake[] = [
  {
    id: "mandarin-symphony",
    name: "Mandarin Symphony",
    description:
      "A house favourite — mandarin blossom cream and soft sponge, remembered for celebrations past.",
    section: "classics",
    imageUrl:
      "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Citrus cream cake",
  },
  {
    id: "strawberry-matcha",
    name: "Strawberry Matcha",
    description:
      "The quiet classic — matcha chiffon with strawberries at their peak.",
    section: "classics",
    imageUrl:
      "https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Matcha and strawberry cake",
  },
  {
    id: "black-sesame",
    name: "Black Sesame",
    description:
      "Toasted black sesame cream — nutty, gentle, unmistakably Whitebird.",
    section: "classics",
    imageUrl:
      "https://images.unsplash.com/photo-1612203985729-70726954388c?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Sesame flavoured cake",
  },
  {
    id: "hojicha-strawberry",
    name: "Hojicha Strawberry",
    description:
      "Roasted tea warmth against soft strawberry — a seasonal memory.",
    section: "classics",
    imageUrl:
      "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Tea and berry cake",
  },
  {
    id: "lychee-rose",
    name: "Lychee Rose",
    description: "Floral and delicate — the cake guests still ask for by name.",
    section: "classics",
    imageUrl:
      "https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Pink floral celebration cake",
  },
  {
    id: "chestnut-mont-blanc",
    name: "Chestnut Mont Blanc",
    description:
      "Winter’s classic — sweet chestnut cream piped with quiet care.",
    section: "classics",
    imageUrl:
      "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Chestnut cream cake",
  },
];
