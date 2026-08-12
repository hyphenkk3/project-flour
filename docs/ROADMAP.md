# Project Flour Roadmap

Authoritative planning view for **where we are**, **what is complete**, **what is next**, and **what comes later**.

Detailed business rules, message formats, financial/lifecycle rationale, and historical Product decisions live in [`docs/DECISIONS.md`](./DECISIONS.md).

---

## Where We Are

- **Product checkpoint:** `ab55cfac1413b5f683dca9e6f4450922e033d279`
- **Milestone 3 — Owner Pickup Operations:** **COMPLETE**
- **Preview 3B Product Tests 1–18:** PASS
- **Milestone 4 — Delivery & Order Fulfilment Foundation:** Product-accepted
  through **M4-P5** (P1–P5 CLOSED for Product; working tree may still be
  uncommitted). No M4-P6 defined.
- **Next:** Product review of deferred Future backlog / commit posture —
  do **not** invent M4-P6 without Product lock.
- Local `main` may be ahead of `origin/main`; do not assume this checkpoint is pushed.

---

## Completed

### Platform Foundations

- Sprint 1 — Application foundation (Next.js App Router, TypeScript, Tailwind, `src/` layout)
- Staff login (Supabase Auth, roles, staff profiles)
- Authenticated application shell (role-aware navigation)
- Foundation Pack 1 — Shared UI primitives
- Foundation Sprint A — Master Library (`/library` cakes, promotions, vouchers, assets)

### Early Product / Mock Era

Mock/preview prototypes only — **not** live Bakery or Collection workspace activation:

- V0.2 — Customer Operations customers/addresses foundation
- V0.3 — Customer Operations order foundation (member orders)
- ENG-002A / V0.4 — Customer website homepage, browse, detail, mock order journey
- V0.5-P5→P11 — Connected mock journey (Customer Operations → Bakery → Collection prototypes)

### Milestone 1 — First Order

- Live guest preorder on customer website → Owner Operations
- Statuses through Submitted → Waiting Customer Confirmation (production path)

### Milestone 2 — Customer Confirmation

- Multi-cake guest preorders, complimentary items, confirmation snapshots
- Prepare Confirmation → WhatsApp handoff → Waiting Customer Confirmation → Customer Confirmed → Awaiting Payment

### Milestone 3 — Owner Pickup Operations

**STATUS: COMPLETE** · Checkpoint: `ab55cfac`

Completed Owner **pickup** operational loop:

Customer submission → Owner review → pre-confirmation pricing/discounts → Customer Confirmation → Awaiting Payment → payment verification → Paid / Preorder Secured → Whole Cake Calendar → Quick View → Ready → Crew Order Message → Customer Ready Message → Picked Up → Customer Thank You Message

Also includes staff-created guest orders, order editing through the payment lifecycle, complimentary items, Ops source visibility, Internal Notes, Bakery Attention, confirmation invalidation, and timeline/history.

| Preview | Focus |
|---|---|
| Preview 1 | Payment foundation |
| Preview 2 | Discounts + Operations usability / post-payment amendment lifecycle |
| Preview 3A-1/2 | Operational foundation + staff-created guest orders |
| Preview 3A-3 | Whole Cake Calendar |
| Preview 3A-4 | Calendar Quick View |
| Preview 3A-5 | Ready / Picked Up UI |
| Preview 3B | Crew / Ready / Thank You messages (copy-only) + pre-confirmation finance |

**Explicitly not part of Milestone 3 completion:** Delivery, EXTRA, real Bakery/Counter activation, WhatsApp automation, refunds UI, POS.

See `docs/DECISIONS.md` (Milestone 3 Preview entries, including Preview 3B).

---

## Current / Next

### Milestone 4 — Delivery & Order Fulfilment Foundation

**STATUS: PRODUCT-ACCEPTED THROUGH M4-P5** (working tree may still be
uncommitted; commit/push only when Product authorizes).

- M4-P1 CLOSED (committed).
- **M4-P2 CLOSED for Product** (Slices 1–5 accepted; working tree may still be
  uncommitted). Website remains Pickup-only for this milestone only.
- **M4-P3 CLOSED / PRODUCT ACCEPTED** (Slices 1–3; working tree may still be
  uncommitted).
- **M4-P4 CLOSED / PRODUCT ACCEPTED** (working tree may still be
  uncommitted).
- **M4-P5 CLOSED / PRODUCT ACCEPTED (2026-08-12)** — Delivery lifecycle +
  customer messaging; Calendar Delivery fill `#ffefd9`; photo/media and
  other deferred non-goals unchanged.

Not one giant Delivery drop. Five Product-testable previews, in locked order:

#### M4-P1 — Paid Order Add-ons

- Reusable paid **non-cake** add-on capability.
- **First Product implementation:** Birthday Card (e.g. `Birthday Card x1` / `RM3(BC)`).
- Architecture reusable for future paid add-ons — **not** a speculative full add-on catalog in P1.
- Birthday Card is **not** Delivery-only (Pickup orders can purchase it).
- Birthday Card is **not** complimentary; complimentary items remain separate.
- Written Birthday Card message = **structured order data** (not Customer/Internal/Bakery/Delivery notes).
- **Dependency lock:** M4-P1 before core Delivery model (P2+).

#### M4-P2 — Fulfilment & Delivery Order Model

- Pickup vs Delivery on the real Owner/guest preorder path.
- Structured fulfilment truth; customer = recipient **or** ≠ recipient.
- Recipient name/phone; structured delivery address.
- Explicit recipient communication preference: Inform Recipient vs DO NOT INFORM RECIPIENT / surprise (never inferred from notes).
- Establishes structured order truth — **not** Delivery Crew Message formatting (that is P4).

#### M4-P3 — Delivery Fees & Settlement

- Processing fee + delivery fee in authoritative settlement and financial equations.
- Crew checks GrabExpress, then **enters** the delivery fee (no scraping / auto-fetch).
- Promotions/discounts continue to reconcile correctly.
- Positive `order_adjustments` remain an engineering recommendation until P3 design confirms — not ROADMAP-locked architecture.

#### M4-P4 — Delivery Crew Message

- Copy-ready Delivery Crew Order Messages from structured truth (P1–P3).
- Supports Delivery Order header, orderer/recipient/phones/address/time, cakes, paid Birthday Card + written message, fees, discounts, payment/NYP/c/o truth, complimentary, Include RECEIPT, Inform / DO NOT INFORM footers.
- Exact formatter rules and examples: `docs/DECISIONS.md`.

#### M4-P5 — Delivery Lifecycle & Customer Messaging

**STATUS: PRODUCT ACCEPTED / CLOSED (2026-08-12).**

- Delivery operational journey + Delivery-appropriate customer messaging.
- Four states: Not Ready → Ready → Out for Delivery → Delivered (Pickup
  remains Not Ready → Ready → Picked Up). Calendar: ● Ready · ○ Out for
  Delivery · ✓ Delivered (Pickup ✓ = Picked Up).
- Pickup Customer Ready Message must not be reused for Delivery.
- Copy-ready Delivery Ready + Out for Delivery customer messages; existing
  Thank You unchanged. Photo upload/send is **not** P5 (future TBD).
- Product-accepted Calendar Delivery fill: pale warm yellow/beige
  (`bg-status-warning-soft` / `#ffefd9`); Pickup no-fill; Today chrome
  remains light blue.

**Locked sequence:** M4-P1 → M4-P2 → M4-P3 → M4-P4 → M4-P5 (complete for Product).
No M4-P6 in this roadmap — next work requires Product lock from Future /
Owner backlog.

---

## Future

Product-approved deferred domains (not next unless Product reorders):

- EXTRA / walk-in Hold and recording workflow
- Real Bakery workspace activation (beyond V0.5 mocks)
- Real Counter / Collection workspace activation (beyond V0.5 mocks)
- Refunds / overpayment / payment-correction workflows
- WhatsApp automation (send API / tracking) — messages remain copy-only until then
- Email / preorder submission-receipt provider
- Promotions administration / Business Settings (beyond temporary August Promo rules)
- POS checkout / completion

Details and rationale: `docs/DECISIONS.md`.

---

## Ideas / Considerations

- **Customer website Order Guide** — surface Owner Order Guide rules on the customer preorder experience (“No wording on cakes or cake boards.” / “Customised cake decoration is not available.”). **Not required before M4.**

---

## Technical Debt

- ESLint reports approximately **20** `react-hooks/set-state-in-effect` findings (pre-existing and some dialog/preview patterns).
- Build and Product-tested Milestone 3 flows are green.
- Maintenance debt only — **does not block Milestone 4**; not a Product milestone.
