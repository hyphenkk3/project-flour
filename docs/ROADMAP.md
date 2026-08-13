# Project Flour Roadmap

Authoritative planning view for **where we are**, **what is complete**, **what is next**, and **what comes later**.

Detailed business rules, message formats, financial/lifecycle rationale, and historical Product decisions live in [`docs/DECISIONS.md`](./DECISIONS.md).

---

## Where We Are

- **Product checkpoint:** `18092cfb07314944f0e8bd6ee5d948fd7b2cf554`
  (`feat: complete Milestone 4 owner operations through M4-P5`) · on
  `origin/main`
- **Milestone 3 — Owner Pickup Operations:** **COMPLETE**
- **Milestone 4 — Delivery & Order Fulfilment Foundation:** **COMPLETE**
  through **M4-P5** (PRODUCT ACCEPTED / CLOSED 2026-08-12). No M4-P6.
- **Milestone 5 — Bakery Activation:** **IN PROGRESS**
- **M5-P1 — Live Bakery Board:** **PRODUCT ACCEPTED / CLOSED (2026-08-12)**
- **M5-P2 — Start Production:** **PRODUCT ACCEPTED / CLOSED (2026-08-13)**
- **M5-P3** remains NOT STARTED
- Working tree may include untracked `tmp/` Product-review assets only —
  do not stage.

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

### Milestone 4 — Delivery & Order Fulfilment Foundation

**STATUS: COMPLETE** · Checkpoint: `18092cf` · Product-accepted through
**M4-P5** (2026-08-12).

| Preview | Focus |
|---|---|
| M4-P1 | Paid Order Add-ons (Birthday Card first) |
| M4-P2 | Fulfilment & Delivery Order Model |
| M4-P3 | Delivery Fees & Settlement |
| M4-P4 | Delivery Crew Message |
| M4-P5 | Delivery Lifecycle & Customer Messaging |

**Locked sequence completed:** M4-P1 → M4-P2 → M4-P3 → M4-P4 → M4-P5.
No M4-P6.

Website remained Pickup-only for Milestone 4 only. Details:
`docs/DECISIONS.md` (M4-P1–P5 entries).

---

## Current / Next

### Milestone 5 — Bakery Activation

**STATUS: IN PROGRESS** · Product-approved 2026-08-12.
**M5-P1:** PRODUCT ACCEPTED / CLOSED (2026-08-12).
**M5-P2:** PRODUCT ACCEPTED / CLOSED (2026-08-13).
**M5-P3:** NOT STARTED.

**Mission:** Replace the V0.5 Bakery preview with a live, authenticated
Bakery workspace on the existing **guest-order** spine, allowing Bakery —
with Manager/Owner coverage — to plan and operate production from Start
Production through canonical Ready.

**Locked sequence (do not reorder without Product approval):**

#### M5-P1 — Live Bakery Board — PRODUCT ACCEPTED / CLOSED (2026-08-12)

- Authenticated `/bakery` workspace + nav for Bakery, Manager, Owner.
- Live guest-order board by fulfilment `pickup_date` (default Today;
  Today / Tomorrow / +2 shortcuts; pick any other date).
- **Final P1 visibility:** **all active guest preorders** for the selected
  fulfilment date regardless of payment stage (Submitted / Pending
  Confirmation / Awaiting Payment / Paid); terminal exclusions;
  Realtime/poll; production-first cards/detail; packing reminder;
  attentions.
- Unsecured visibility is for Bakery **planning** and does **not** itself
  authorize production. Secured vs unsecured is presented via canonical
  order status (Start rules reconciled in M5-P2).
- Production presentation in P1: **Not started | Ready only** (no In
  Production). Labels describe production state only — not authorization.
  **No** Start schema in P1 (`production_started_at` /
  `production_started_by` deferred to M5-P2).
- **No** Start/Ready mutations from Bakery in P1.
- Packing checklist remains reminder-only/local state, including Check all
  / Clear all (accepted refinement).

#### M5-P2 — Start Production — PRODUCT ACCEPTED / CLOSED (2026-08-13)

- Introduces `production_started_at` / `production_started_by` with Start /
  Undo Start RPC + timeline (whole-order).
- Server-side authorization for Bakery production capability
  (Bakery / Manager / Owner).
- Start / Undo Start on **Bakery workspace only** (not Owner Order
  Workspace / Calendar Quick View). Owner Collection controls retained.
- Board columns: **Not started | In Production | Ready**.
- **Visibility** remains Submitted → Paid. **Start** is allowed only for
  Awaiting Payment and Paid (not Submitted / Pending Confirmation —
  **Waiting for confirmation** UX).
- Unsecured Awaiting Payment Start requires staff confirmation (Cancel
  leaves Not started). Paid Start does not. No Owner production-authorization
  field.
- Payment Attention derived; Q13 demotion retention accepted via automated
  coverage (no Owner demote control).
- Owner Ready without Start / Start then Owner Ready remain the P2 Ready
  boundary (Bakery Mark Ready deferred to P3).
- **Accepted P2 refinement:** authoritative effective pickup schedule
  resolver + Early Pickup Bakery Attention (derived; coexists with manual
  Attention) + Owner outside-hours warning/continue. Code-config date
  overrides only — no Business Calendar Admin UI / DB persistence.

#### M5-P3 — Bakery Ready Authority + Exception Polish

- Bakery / Manager / Owner Mark Ready / Undo Ready from Bakery on
  canonical `ready_at` / `ready_by`.
- **Server/RPC authority required** (UI capability and server must agree).
- Owner Ready controls remain on existing Owner surfaces (override).
- Payment Attention (derived) + demotion retention rules; terminal board
  exit verified.
- Does **not** remove Owner Ready; does **not** give Bakery
  Picked Up / Out / Delivered.

**Authority / board equation / non-goals / EXTRA compatibility:**
`docs/DECISIONS.md` (Milestone 5 lock entry).

**Next implementation slice:** **M5-P3 — Bakery Ready Authority + Exception
Polish** (NOT STARTED).

---

## Future

Product-approved deferred domains (not next unless Product reorders):

- EXTRA / walk-in Hold and recording workflow (separate physical-stock
  domain — **not** part of Milestone 5)
- Real Counter / Collection workspace activation (beyond V0.5 mocks)
- Refunds / overpayment / payment-correction workflows
- WhatsApp automation (send API / tracking) — messages remain copy-only until then
- Email / preorder submission-receipt provider
- Promotions administration / Business Settings (beyond temporary August Promo rules)
- POS checkout / completion

Details and rationale: `docs/DECISIONS.md`.

---

## Ideas / Considerations

- **Customer website Order Guide** — surface Owner Order Guide rules on the customer preorder experience (“No wording on cakes or cake boards.” / “Customised cake decoration is not available.”). **Not required before M4/M5.**
- **Customer Notes accommodation copy** — clarify what customer requests Bakery can honour. Not an M5 blocker; not Customer Portal work in M5.

---

## Technical Debt

- ESLint reports approximately **20** `react-hooks/set-state-in-effect` findings (pre-existing and some dialog/preview patterns).
- Build and Product-tested Milestone 3–4 flows are green.
- Maintenance debt only — **does not block Milestone 5**; not a Product milestone.
