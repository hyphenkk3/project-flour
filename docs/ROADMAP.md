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
- **Milestone 5 — Bakery Activation:** locked sequence **M5-P1 → M5-P2 →
  M5-P3** complete (Milestone 5 board/Start/Ready activation closed)
- **M5-P1 — Live Bakery Board:** **PRODUCT ACCEPTED / CLOSED (2026-08-12)**
- **M5-P2 — Start Production:** **PRODUCT ACCEPTED / CLOSED (2026-08-13)**
- **M5-P3 — Bakery Ready Authority:** **PRODUCT ACCEPTED / CLOSED
  (2026-08-13)**
- **Live Collection workspace activation (v1):** **PRODUCT ACCEPTED /
  CLOSED (2026-08-13)**
- **EXTRA Activation v1:** **PRODUCT ACCEPTED / CLOSED (2026-08-13)**
  (Propose / Confirm / Reject+Undo / Available; no Hold/sale/public)
- **EXTRA v1.1 — Calendar-assisted proposal:** **PRODUCT ACCEPTED /
  CLOSED (2026-08-13)** (Calendar Quick View Propose EXTRA; Matrix EXTRA
  on prepared_on; no Hold/sale/public / Confirm-on-Calendar)
- **Operations Smoothness Pass — Slice 1:** **PRODUCT ACCEPTED / CLOSED
  (2026-08-14)** (Today-first Ops grouping + derived attention; no migration)
- **Operations Smoothness Pass — Slice 2:** **PRODUCT ACCEPTED / CLOSED
  (2026-08-14)** (Attention → Action in Order Workspace + Ops search-row
  layout; no migration)
- **Whole Cake Calendar compact-controls polish:** **PRODUCT ACCEPTED /
  CLOSED (2026-08-14)** (single desktop toolbar; Matrix-only controls;
  no business/data change; no migration)
- **Bakery EXTRA awareness:** **PRODUCT ACCEPTED / CLOSED (2026-08-14)**
  (`EXTRA · N` + Production awaiting-review callout; page-load freshness;
  no migration)
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

**STATUS:** Locked sequence **complete** (P1–P3 PRODUCT ACCEPTED / CLOSED).
**M5-P1:** PRODUCT ACCEPTED / CLOSED (2026-08-12).
**M5-P2:** PRODUCT ACCEPTED / CLOSED (2026-08-13).
**M5-P3:** PRODUCT ACCEPTED / CLOSED (2026-08-13).

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

#### M5-P3 — Bakery Ready Authority + Exception Polish — PRODUCT ACCEPTED / CLOSED (2026-08-13)

- Bakery / Manager / Owner Mark Ready / Undo Ready from Bakery detail on
  canonical `ready_at` / `ready_by` (**server/RPC enforced**).
- **Q1=A:** Bakery Mark Ready requires In Production (Start first). Owner
  Ops / Calendar may still Ready without Start (no fabricated Start).
- Ready footer: **Undo Ready only**. In Production: Mark Ready + Undo Start.
  No Mark Ready confirmation. Packing does not gate.
- Undo Ready preserves Start → In Production; without Start → Not started.
- AP · In Production may Ready; Payment Attention / Not secured retained.
- Hardened `mark_guest_order_ready` / `undo_guest_order_ready` (roles +
  terminal guards). Fixture-cleanup live-test fix included in P3 close.
- Does **not** remove Owner Ready; does **not** ship Collection / EXTRA /
  packing persistence / Business Calendar Admin; does **not** give Bakery
  Picked Up / Out / Delivered.

**Authority / board equation / non-goals / EXTRA compatibility:**
`docs/DECISIONS.md` (Milestone 5 lock entry + M5-P3 accepted freeze).

### EXTRA Activation v1 — PRODUCT ACCEPTED / CLOSED (2026-08-13)

- Separate physical-stock domain under Bakery (`/bakery/extra`).
- Propose → Confirm / Reject (required trimmed reason + Undo Reject same
  row → proposed); Bakery may create confirmed stock directly.
- Available = confirmed && now ≤ pickup_through_at (derived; no `available`
  status).
- Prepared/origin date + Bakery pickup-through required for confirmed.
- Authority: bakery | manager | owner on Bakery EXTRA; CO / Collection
  denied at RPC. Owner propose entry from Ops → Bakery EXTRA.
- Explicitly deferred (not this slice): Hold/Release, walk-in sale,
  public EXTRA listing, previous-day customer acknowledgement,
  Calendar-assisted EXTRA proposal, Collection EXTRA, POS, Slice,
  origin enum.

**Authority / exclusions:** `docs/DECISIONS.md` (EXTRA Activation v1
accepted freeze).

### EXTRA v1.1 — Calendar-assisted proposal — PRODUCT ACCEPTED / CLOSED (2026-08-13)

- Owner Whole Cake Calendar Quick View: per cake line **Propose EXTRA**.
- Prefills cake/size (+ library IDs when present) from the selected item.
- One submit = one `extra_stock` proposed unit (item qty is context only).
- `prepared_on` defaults to fulfilment `pickup_date` minus one Singapore
  calendar day; editable before submit.
- Reuses EXTRA v1 propose path; no order clone/mutation; no Confirm.
- After submit: stay on Calendar; **keep same Quick View open** with line
  success; do not force Bakery navigation.
- Matrix shows proposed/confirmed EXTRA on **`prepared_on`** with explicit
  EXTRA badge (rejected / null prepared_on / expired confirmed excluded).
- No source-order FK / generated context note. No Calendar Confirm/Reject.
- Explicitly deferred (unchanged): Hold/Release, walk-in sale, public
  EXTRA, POS, Collection EXTRA, Slice, origin enum, previous-day customer
  acknowledgement, automatic carry-forward UI, source preorder
  clone/mutation, fake EXTRA financial orders, Bakery Production-column
  overload, broader Calendar redesign, Milestone 6.

### Operations Smoothness Pass — Slice 1 — PRODUCT ACCEPTED / CLOSED (2026-08-14)

- Owner Operations default pickup filter = **Today**.
- Today groups: **Needs Attention** / **All Clear** / **Completed**.
- Derived `deriveOwnerAttention` (not persisted): Confirmation not prepared;
  Waiting for customer confirmation; Customer reconfirmation needed;
  Payment needed; Payment overdue; Fee request pending.
- Bakery Attention excluded from Ops Needs Attention. No RM on cards.
- Reconfirmation current only until fulfilment terminal (`picked_up` /
  `delivered`); `out_for_delivery` remains actionable; history flag kept.
- Workspace: actionable reconfirmation warning + Prepare Updated Confirmation.
- Compact toolbar: Search / Pickup / Status / Sort.
- Visual hierarchy: Needs Attention strongest → All Clear positive →
  Completed muted.
- Deferred polish: clearer horizontal spacing between Today summary counts
  (cosmetic; did not block acceptance).

### Operations Smoothness Pass — Slice 2 — PRODUCT ACCEPTED / CLOSED (2026-08-14)

- Unified Order Workspace **Needs Attention** block (same Slice 1
  `deriveOwnerAttention`); reason → existing action / section jump.
- Ops toolbar: Search full-width row above Pickup / Status / Sort; Today
  summary spacing correction (`gap-x-8`).
- Product manual PASS: Submitted → Prepare Confirmation; Awaiting Payment →
  Go to Payment scroll; no-attention quiet workspace; Ops layout/hierarchy.
- No migration; Slice 1 semantics preserved.

### Whole Cake Calendar compact-controls polish — PRODUCT ACCEPTED / CLOSED (2026-08-14)

- Month navigation + View / Matrix / Today consolidated into one desktop
  toolbar; Matrix controls only when View = Matrix; responsive wrap.
- Calendar/matrix begins immediately below; no separate secondary toolbar.
- Density/layout only — no business/data behavior change; no migration.

### Bakery EXTRA awareness — PRODUCT ACCEPTED / CLOSED (2026-08-14)

- Canonical pending: `lifecycle === "proposed"`; lightweight count query.
- EXTRA tab: `EXTRA · N` when count > 0; Production compact warning callout
  → `/bakery/extra`; zero-state hidden; page-load/nav freshness only.
- Product manual PASS: Production hierarchy; `EXTRA · N`; warning callout;
  callout → EXTRA; count refresh after actioning (`EXTRA · 3` → `EXTRA · 2`).
- No realtime/notifications; ExtraBoard Confirm/Reject unchanged; no migration.

### Live Collection workspace activation (v1) — PRODUCT ACCEPTED / CLOSED (2026-08-13)

- Authenticated `/collection` for **collection · manager · owner**.
- Pickup-only Ready queue → **Mark Collected** → canonical `picked_up_at` /
  `picked_up_by`; **Undo Collected** restores Ready on Collection + Bakery.
- Hardened `mark/undo_guest_order_picked_up` (roles owner|manager|collection;
  bakery/CO denied). Guest + pickup-only.
- Keep M5 Bakery exit on `picked_up_at` (no Arrived exit). Owner Ops Picked Up
  remains override.
- No Arrive/Verify persistence; packing reminder-only (local; does not gate).
- Delivery Out/Delivered remain Owner Ops; no Collection Delivery desk.
- Payment independent: AP Ready may Collect; finance unchanged.
- Bakery has no Collect controls; Collection has no Ready authority.

**Authority / exclusions:** `docs/DECISIONS.md` (Live Collection accepted
freeze).

---

## Future

Product-approved deferred domains (not next unless Product reorders):

- EXTRA Hold / Release, walk-in sale recording, public EXTRA listing
- Calendar EXTRA Confirm/Reject/Undo (Bakery EXTRA remains authority)
- Previous-day customer acknowledgement for EXTRA / walk-in context
- Collection EXTRA desk · EXTRA Slice · EXTRA origin enum
- Refunds / overpayment / payment-correction workflows
- WhatsApp automation (send API / tracking) — messages remain copy-only until then
- Email / preorder submission-receipt provider
- Promotions administration / Business Settings (beyond temporary August Promo rules)
- POS checkout / completion
- Packing checklist persistence
- Business Calendar Admin UI / DB override persistence
- Delivery Collection desk workflow (Collection v1 is Pickup-only)

Details and rationale: `docs/DECISIONS.md`.

---

## Ideas / Considerations

- **Customer website Order Guide** — surface Owner Order Guide rules on the customer preorder experience (“No wording on cakes or cake boards.” / “Customised cake decoration is not available.”). **Not required before M4/M5.**
- **Customer Notes accommodation copy** — clarify what customer requests Bakery can honour. Not an M5 blocker; not Customer Portal work in M5.

---

## Technical Debt

- ESLint reports approximately **20** `react-hooks/set-state-in-effect` findings (pre-existing and some dialog/preview patterns).
- Build and Product-tested Milestone 3–4 flows are green.
- Maintenance debt only — **does not block** live Collection activation; not a Product milestone.
