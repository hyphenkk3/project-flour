# Decisions

Record of durable project decisions. Newest first.

## 2026-08-11 — M4-P2 Slice 5 CLOSED · Calendar fulfilment background ACCEPTED

**STATUS: CLOSED** for authorized Slice 5 scope (Calendar fulfilment awareness /
background colour). Implementation remains uncommitted on working tree at HEAD
`b95f5da4934296e0865c1b76f5dbd3bdd4568c10` until Product authorizes commit.

Visual Trial 1 (`#e4f0ee`, tight `px-0.5`) was rejected as too subtle.
**Visual Trial 2 is Product-accepted.**

### Accepted Calendar fulfilment presentation (locked Slice 5 Product truth)

- Calendar month list carries lightweight `fulfilmentMethod` from
  `orders.fulfilment_method` (no Delivery details query; **no migration**).
- Presentation derives from stored/normalized **fulfilment_method only** —
  never from customer/order name text (e.g. a name containing “pickup”).
- Fulfilment distinction uses **BACKGROUND COLOUR** on the customer/order
  identity line (not emoji; not status text colour).
- **Pickup** = existing/default baseline (no fulfilment fill).
- **Delivery** = soft identity background:
  - class: `bg-signal-soft`
  - token: `--color-signal-soft: #b8d4cf`
  - chrome: `inline-block rounded-sm px-1 py-0.5`
- Status text colours remain authoritative for order/payment state and must
  coexist with Delivery background.
- Ready `●` / Picked Up `✓` / bakery-attention bold / RM10 strikethrough /
  source·crew suffixes remain unchanged and coexist.
- Today chrome (`status-info-soft`) remains independent of Delivery identity fill.
- Guide documents Delivery swatch + Pickup default; no Dine-In Guide row; no emoji.
- Copy: “Production scan by fulfilment date…”; “No whole-cake orders…”.
- null / unknown / `drive_through` → Pickup baseline (never invent Delivery).
- Future Dine-In may extend the presentation map later — **not** implemented in
  M4-P2 Owner controls.

Matrix/Cakes production counts remain cake-only (`order_items`); fulfilment is
presentation metadata only. Quick View was not visually redesigned by Slice 5
(Slice 4 Delivery-aware QV preserved).

### Carry-forward (unchanged; do not pull into closed Slice 5)

- Delivery RM5 processing fee + variable Delivery fee → **M4-P3**
- Delivery Crew message → **M4-P4**
- Fulfilment-aware Delivery completion / lifecycle terminology → **M4-P5**
- Operations non-default fulfilment indicator / emoji → **Owner Operations backlog**
- Order Workspace → View in Calendar → **Owner workflow backlog**
- EXTRA untouched · Dine-In outside M4-P2 Owner controls

## 2026-08-11 — M4-P2 Slice 4 CLOSED · Product Tests 1–14 PASS

**STATUS: CLOSED** for authorized Slice 4 scope (Confirmation + Crew gate +
Quick View). Implementation remains uncommitted on working tree at HEAD
`b95f5da4934296e0865c1b76f5dbd3bdd4568c10` until Product authorizes commit.

M4-P2 Slice 5 is CLOSED (see above). M4-P3 / M4-P4 / M4-P5 are **not started**.

### Accepted Confirmation presentation (locked Slice 4 Product truth)

Shared opening/closing separator (Pickup + Delivery; identical rails):

`____________________________________________________________` (exactly 60 `_`)

Delivery different-recipient identity + notify rules, Same-as-Customer compact
identity, KK/Sabah omitted from customer-facing Address, complimentary↔notify
adjacency, Time→Whole Cake blank line, and frozen historical `message_body`
behaviour are Product-accepted. Do not redesign unless Product reopens.

Delivery Crew remains gated: “Delivery Crew message is not available yet.”
(Pickup Crew unchanged.) Delivery Quick View / Pickup Quick View accepted.

**Financial boundary at Slice 4:** Delivery still contributes **RM0** to
settlement. Product Test 13 PASS only proves non-regression of existing
payment/discount/paid-add-on behaviour — **not** acceptance of final Delivery
totals once fees exist.

### Carry-forward Product truths (NOT implemented; do not pull into Slice 4/5)

| Observation | Classification (existing plan) |
| --- | --- |
| RM5 processing fee + variable Delivery fee (historically often rounded RM5/10/15/20 + RM5 pf; architecture not locked to those values) | **M4-P3 — Delivery Fees & Settlement** |
| Delivery Crew message body | **M4-P4 — Delivery Crew Message** |
| Fulfilment-aware Delivery completion (Collection / Mark Picked Up is wrong for Delivery; labels e.g. Ready / Out for Delivery / Delivered **not locked**) | **M4-P5 — Delivery Lifecycle & Customer Messaging** |
| Calendar fulfilment colours / Delivery Calendar awareness | **M4-P2 Slice 5** — **CLOSED / Product-accepted** |
| Operations list non-default fulfilment indicator (subtle scan cue; emoji 🚗/🍽️ suggested only) | **Owner Operations backlog** — not an M4-P2 Slice 5 item; not M4-P3/P4/P5 |
| Order Workspace → “View in Calendar” (navigate to fulfilment date; preferably surface/open originating order via existing Calendar/Quick View; **navigation only / zero mutation**) | **Owner workflow backlog** — reuse existing Calendar architecture; not Slice 5 colours; not M4-P3/P4/P5 |
| Dine-In fulfilment controls / product path | **Outside M4-P2** (see below). Ops indicator may eventually mention Dine-In without bringing Dine-In into M4-P2. |
| EXTRA workflow | **Out of M4-P2** (unchanged) |

## 2026-08-11 — M4-P2 Product truths recorded (Slice 5 accepted)

### Calendar fulfilment colour (M4-P2 Slice 5 — CLOSED)

Fulfilment type is operationally represented by background colour on Calendar
identity lines. Accepted Product mapping:

- normal Pickup — baseline / default background
- Delivery — `bg-signal-soft` (`#b8d4cf`) + `inline-block rounded-sm px-1 py-0.5`
- Dine-in — future different background; **not** implemented in M4-P2 Owner controls

Dine-in must **not** be introduced into Owner M4-P2 fulfilment controls.

### EXTRA workflow (out of M4-P2)

Future EXTRA:

- Owner may input/propose EXTRA.
- Bakery may input/propose EXTRA.
- Bakery has final authority.
- Proposed EXTRA is **not** sellable.
- Only Bakery-confirmed EXTRA becomes sellable/available stock.
- Bakery may delete/reject an EXTRA proposed by Owner.

Do not implement EXTRA in M4-P2.

## 2026-08-09 — Milestone 3 CLOSED · Milestone 4 NEXT (roadmap lock)

Product-approved roadmap reconciliation after Preview 3B.

### Milestone 3 — Owner Pickup Operations

**STATUS: COMPLETE**

- Checkpoint: `ab55cfac1413b5f683dca9e6f4450922e033d279`
- Preview 3B Product Tests **1–18: PASS**
- Owner **pickup** operational loop is closed (submit → review → pre-confirmation
  discounts → confirmation → payment → calendar → Ready → Crew/Ready messages →
  Picked Up → Thank You). Staff guest create, edit-through-payment, complimentary,
  source on Ops cards, Internal Notes, Bakery Attention, confirmation invalidation,
  and timeline are in scope for this completion.
- Delivery, EXTRA, real Bakery/Counter activation, WhatsApp automation, refunds UI,
  and POS remain **future** — they do not keep Milestone 3 open.
- Preview 3B required **no** migration.

### Milestone 4 — Delivery & Order Fulfilment Foundation

**STATUS: IN PROGRESS**

- **M4-P1 — Paid Order Add-ons:** CLOSED (committed at
  `b95f5da4934296e0865c1b76f5dbd3bdd4568c10`).
- **M4-P2 — Fulfilment & Delivery Order Model:** CLOSED for Product (Slices 1–5
  accepted; working tree uncommitted). Website remains Pickup-only for this
  milestone only.
- **M4-P3 / M4-P4 / M4-P5:** not started.

Locked Product-testable preview sequence (do not reorder without Product approval):

1. **M4-P1 — Paid Order Add-ons** — reusable paid non-cake add-ons; first concrete
   Product implementation is **Birthday Card** (e.g. RM3(BC)) with structured written
   message. Not Delivery-only; not complimentary; not a speculative full add-on catalog.
2. **M4-P2 — Fulfilment & Delivery Order Model** — Pickup vs Delivery on Owner/guest
   path; recipient modes; address; Inform vs DO NOT INFORM / surprise (structured).
3. **M4-P3 — Delivery Fees & Settlement** — processing fee + crew-entered delivery fee
   after GrabExpress check; authoritative settlement/equations.
4. **M4-P4 — Delivery Crew Message** — copy-ready Delivery Crew messages from P1–P3 truth.
5. **M4-P5 — Delivery Lifecycle & Customer Messaging** — Delivery ops + customer messaging.

**Dependency:** Paid add-ons (P1) before core Delivery model (P2+).

**Not locked yet:** Delivery lifecycle terminology (e.g. Out for Delivery / Delivered).
Decide during M4-P5 Product design/review. Pickup “Picked Up” and Pickup Ready copy
must not be reused for Delivery without Product review.

Planning overview: `docs/ROADMAP.md`. Detailed Delivery requirements remain in the
earlier Preview 3B Delivery deferred (Option C) decision.

## 2026-08-09 — Pickup instruction retired from Owner UI (structured time only)

Free-text `pickup_instruction` conventions such as “Before 3pm” are retired from
Owner create/edit, Order Workspace Pickup display, and Calendar Quick View.

Crew Order Message and Customer Confirmation use structured `pickupTime` only.

**Historical:** `orders.pickup_instruction` column and existing values remain.
Workspace Save preserves the stored value (field is not editable). New Owner
orders create with `pickup_instruction = null`.

Customer website does not expose this field. Ready Message GrabExpress
“before 3:00pm” guidance is unrelated and unchanged.

## 2026-08-09 — Milestone 3 Preview 3B · Messages + pre-confirmation finance (Product-tested)

Preview 3B Product Tests **1–18: PASS.** Committed at checkpoint
`ab55cfac1413b5f683dca9e6f4450922e033d279` (Milestone 3 closed — see
roadmap lock decision above).

### Messages (pickup-only; copy for WhatsApp — no API / send tracking)

- **Crew Order Message** — INTERNAL · CREW; temporarily editable; structured
  `pickupTime`; shared financial equation + Crew-only payment suffix
  (NYP / allocations / c/o). No Bakery Attention in Crew body.
- **Customer Ready Message** — CUSTOMER; primary when Ready ●; secondary after
  Picked Up ✓; sender defaults to authenticated staff `displayName` (temporary
  override). GrabExpress “before 3:00pm” + day last-pickup times preserved.
- **Customer Thank You Message** — CUSTOMER; primary when Picked Up ✓; exact
  constant body (not editable).
- Shared availability/priority + Message Preview (portaled); Quick View +
  Order Workspace.

### Pre-confirmation finance

- Order Total / Adjustments on Submitted + Pending Confirmation.
- Payment collection/history remains Awaiting Payment / Paid.
- Customer Confirmation uses the same shared financial-equation calculator as
  Crew (no Crew payment suffixes). RM10 shows `Voucher No.` from
  `order_adjustments.metadata.voucher_number`.
- Amount-due changes while Pending Confirmation keep existing stale /
  needs-resend path.

### Workspace / Ops refinements during 3B testing

- Locked Workspace section hierarchy + Order Guide; Customer Notes hidden (DB
  preserved); pickupInstruction UI retired; Operations order cards show source;
  Delivery deferred (Option C — separate decision above).

No migration for Preview 3B.

## 2026-08-09 — Order Workspace hierarchy · Order Guide · Customer Notes hidden

Owner Order Workspace section sequence locked to Whitebird processing flow:

1. Customer → 2. Pickup → 3. Order → 4. Complimentary items →
5. Order Total / Adjustments (Submitted / Pending Confirmation) **or**
   Payment (Awaiting Payment / Paid) → 6. Collection → 7. Messages →
8. Internal notes → 9. Bakery attention

**Customer Notes** (`orders.customer_notes`) is hidden from the Owner Order
Workspace UI only. Column and existing values remain intact; not migrated into
Internal Notes. May be reconsidered if a real operational use case appears.

**Order Guide** (permanent staff guidance on the Order section — not notes):

- No wording on cakes or cake boards.
- Customised cake decoration is not available.

### Future consideration

These ordering restrictions are frequently asked and may also need to surface
on the **Customer website** preorder experience. Not implemented in this
refinement — Owner Workspace only for now.

## 2026-08-09 — Milestone 3 Preview 3B · Delivery deferred (Option C)

Preview 3B Crew Message generators remain **pickup-only**.

Delivery was audited against historical Whitebird Crew messages and current
schema/DTO/settlement architecture. Product decision: **Option C** — Delivery
requires a **separate future preview/foundation**, not inclusion inside 3B.

### Why not 3B

Truthful Delivery Crew messages need order-level data that guest/Owner
Calendar flows do not yet expose or persist (recipient modes, address,
notification preference, delivery/processing fees in settlement, Birthday Card
as a paid add-on with written message, and Delivery lifecycle wording).

`fulfilment_method` already includes `delivery` in the DB enum, but guest create
paths hardcode `pickup` and Owner `StorefrontOrder` does not expose fulfilment.

### Preserved Product requirements (future Delivery preview)

- Header: `🟢🚗 Delivery Order: D/M (Day)`; unpaid `🔺🟢🚗…`
  (`🟢` decorative; `🚗` delivery indicator; `🔺` payment incomplete only)
- Modes: customer = recipient; customer ≠ recipient
- Explicit recipient name + phone; delivery address; delivery time
- Explicit `*DO NOT INFORM RECIPIENT (It’s A Surprise!)` vs
  `*Inform Recipient before delivery` (never inferred)
- Crew manually checks GrabExpress and **enters** delivery fee
- Processing fee is part of Delivery financial truth
- Fees must feed authoritative settlement (e.g. positive adjustments), not
  message-only math; equation may include pf / df / promotions
- Birthday Card = paid add-on/order concept, not Crew-message-owned data
- Birthday Card written message = canonical order data (not notes dump)
- Pickup-specific Customer Ready Message must **not** be used for Delivery
- Generic Customer Thank You wording may be reusable
- Operational lifecycle needs future Product design — “Picked Up” is
  semantically wrong for completed Delivery (possible Ready /
  Out for Delivery / Delivered — undecided)

### Explicit non-goals for 3B

No Delivery schema, UI, formatter branches, GrabExpress automation, or
Birthday Card product work in Preview 3B.

See also `docs/ROADMAP.md` (Milestone 3 — Delivery foundation deferred).

## 2026-08-09 — Milestone 3 Preview 3A-5 · Ready / Picked Up operations (Product-tested)

Preview 3A-5 is closed. **16 / 16 Product tests PASS.**

Owner-only collection lifecycle UI on top of the 3A-1 foundation
(`ready_at` / `ready_by` / `picked_up_at` / `picked_up_by` + existing RPCs /
Owner actions / timeline events). No new migration for 3A-5.

Frozen migrations remain unamended (including
`20260808100000_preview3a3_calendar_item_sync_realtime.sql`).

### Domain rule

Ready / Picked Up is **operational collection state**, independent of
financial `order_status`. Valid combinations include Awaiting Payment + Ready,
Awaiting Payment + Picked Up, Paid + Not Ready, Paid + Ready, Paid + Picked Up.
Mutations do **not** change payment, confirmation, discounts, or order_status.

### Operational rules (Product-approved)

- States: **Not Ready** → **Ready** → **Picked Up** (with direct Not Ready →
  Picked Up allowed).
- **Ready is NOT required** before Mark Picked Up.
- **Undo Ready** is unavailable in UI and blocked by RPC while Picked Up.
- **Undo Picked Up** preserves prior `ready_at` / `ready_by`:
  - Ready → Picked Up → Undo → Ready
  - Not Ready → Picked Up → Undo → Not Ready
- Timeline retains staff actor (`order_marked_ready`, `order_ready_undone`,
  `order_picked_up`, `order_picked_up_undone`).

### Surfaces

- **Primary mutations:** Calendar Quick View Collection controls + Order
  Workspace Collection controls (shared `OrderOperationalControls` +
  `operational-state` helper).
- **Calendar markers:** ● = Ready · ✓ = Picked Up · Picked Up wins (never both)
  on Matrix Customers, Cakes, Orders. Matrix **Totals** stays quantity-only.
- **Calendar Guide** documents ● / ✓ with existing status / bold / RM10 notes.
- **Operations cards:** read-only ● / ✓ only — no Ready/Picked Up mutations.
- Quick View mutations keep Calendar mounted and preserve document Y / Matrix X;
  Calendar markers refresh via existing orders Realtime (+ poll fallback).

### Access

- All Ready / Picked Up mutations remain **Owner-only** for this preview
  (`requireOwner` + guest-order RPCs).
- Bakery / Counter workspace activation and role permissions are **not**
  enabled in 3A-5.

### Out of scope (deferred)

- Bakery / Counter activation, EXTRA, Crew WhatsApp automation, POS,
  permissions/RLS redesign, status-colour redesign

## 2026-08-09 — Milestone 3 Preview 3A-4 · Calendar Quick View (Product-tested)

Preview 3A-4 is closed. Owner Calendar Quick View is Product-approved.
Preview 3A-5 Ready / Picked Up closed separately (see above).

No new migration for 3A-4. Frozen 3A-3 migration remains:
- `20260808100000_preview3a3_calendar_item_sync_realtime.sql` (do not amend)

### Purpose / boundary

- Read-only operational overlay so Owner can inspect an order from Calendar
  without leaving the month board.
- Deeper work uses **View Order** → existing Owner Order Workspace.
- No payment / discount mutation controls in Quick View (3A-5 adds collection
  Ready/Picked Up mutations only).

### Entry points

- Matrix **Customers**, **Cakes**, and **Orders** open Quick View.
- Matrix **Totals** stays aggregate-only (no single-order click).

### Architecture

- Calendar stays mounted; Quick View is a right-side sheet (`<dialog>`).
- On open: `getCalendarQuickViewOrderAction` → existing `getGuestOrderById`
  (one targeted fetch). Month Calendar read model stays slim.
- Reuses settlement truth, effective adjustments, complimentary rows,
  source/crew helpers, StatusBadge / guest-order status helpers.

### Content (accepted)

Customer display name + source/(crew), order number, status, pickup
date/time (structured `pickupTime` only — free-text instruction retired from
Quick View UI; see 2026-08-09 pickup instruction retirement), phone (or quiet
“No phone number”), cake snapshots (name / size / qty), complimentary/prep when
present, physical Include RECEIPT, Bakery Attention + note, payment summary
(amount due / received / balance), effective RM10 (reversed not shown as active).
Preview 3B adds Messages (Crew / Ready / Thank You) via shared Order Messages UI.

### Dismissal

- ×, Escape, and dimmed-backdrop click close Quick View.
- Clicks inside the white sheet do not close it.
- Closing does not navigate or remount Calendar; document Y, Matrix X,
  month, view, and Matrix Customers/Totals mode are preserved.

### View Order / return

Calendar → Quick View → View Order → Order Workspace → ← Whole Cake Calendar
uses existing `returnTo` / `rp=1` exact Y + Matrix X restoration (3A-3).

### Status colours (visual only; revisitable)

During 3A-4, shared status-token contrast was strengthened for scanning.
**Current implemented colours are retained for now** and may be revised in a
future Product visual pass. This is not a lifecycle/domain change — status
enums, meanings, and payment logic stay as in 3A-3.

### Out of scope (deferred)

- EXTRA, Collection categories, Bakery workspace activation, Crew WhatsApp
  generation, POS, permissions/RLS redesign

## 2026-08-08 — Milestone 3 Preview 3A-3 · Whole Cake Calendar (Product-tested)

Preview 3A-3 is closed. Owner-only Whole Cake Calendar at `/owner/calendar`.
Preview 3A-4 Quick View closed separately (see above).

Applied migration (do not amend):
- `20260808100000_preview3a3_calendar_item_sync_realtime.sql`
  (`sync_guest_order_items` touches `orders.updated_at` so item-only sync emits
  orders Realtime for Calendar Cake/Matrix refresh)

### Views / defaults

- Views: **Matrix | Cakes | Orders**
- Default: **Matrix** + **Customers** (`?view=matrix&matrix=customers`)
- Missing/invalid view → matrix; Matrix mode URL: `matrix=customers|totals`
- Cakes: cake snapshot lines (`cake_name` / `size_label` / `×qty` + customer)
- Orders: compact customer list (status / source / crew / attention / RM10)
- Read model: active guest orders (`customer_id` null; submitted /
  pending_confirmation / awaiting_payment / paid); order-item snapshots only —
  not Collection membership

### Matrix

- Columns: Cake/Size sticky + one column per day of selected month
- Rows: unique ordered cake+size snapshots for the month
- Customers mode: customer links with Operations status colour, source/(crew),
  bakery-attention bold, effective RM10 strikethrough; qty>1 as `Name ×N`
- Totals mode: aggregate quantity only (`×N`) per cake/size/date
- Horizontal + vertical scroll; sticky date header + Cake/Size column
- Fresh current-month Matrix entry horizontally focuses **Today**

### Navigation / scroll (working position)

- Calendar internal Links use `scroll={false}` (Customers↔Totals, view switches,
  Prev/Next, sidebar/Ops Calendar links) so document does not jump to top
- Customers ↔ Totals: preserve `window.scrollY` and Matrix `scrollLeft`
- Matrix ↔ Cakes ↔ Orders: preserve document scrollY (clamp if shorter)
- Calendar → Operations → Calendar (SPA): restore useful Calendar vertical
  working position; Matrix horizontal = **Today** for current month — do **not**
  resurrect pre-Operations Matrix `scrollLeft`
- Calendar → Order Workspace → ← Whole Cake Calendar (`rp=1`): restore exact
  document Y + Matrix X (one-shot); ordinary Calendar entry does not
- **Today**: horizontal Today focus; document Y unchanged
- Hard reload / fresh browser entry: no stale vertical or Matrix horizontal restore

### Pickup amendment

- Same-month pickup amendments save normally
- Cross-month pickup requires explicit **Owner override** checkbox in Order
  Workspace; otherwise blocked with clear error

### Realtime / polling

- Subscribe to `orders` changes; reconcile month entries (including item
  snapshots after frozen item-sync touch)
- 30s full-month poll fallback for all three views

### Out of scope (deferred)

- Ready / Picked Up UI, EXTRA, Collection categories, Bakery
  workspace activation, Crew WhatsApp, POS, permissions/RLS redesign

## 2026-08-08 — Milestone 3 Preview 3A-1/2 · Closed checkpoint (Product-tested)

Preview 3A-1 (operational foundation) and 3A-2 (Owner staff-created guest orders)
are closed. Preview 3A-3 Whole Cake Calendar closed separately (see above).

Applied migrations (do not amend):
- `20260808090000_preview3a1_operational_foundation.sql`
- `20260808093000_preview3a2_staff_guest_preorder.sql`

### Access

- Preview 3 remains **Owner-only** for now (`requireOwner`).
- Bakery workspace / routes / Counter access not enabled.
- Actor FKs retained for future authorised staff.

### Catalog / cake selection

- Collection controls **customer storefront** merchandising (`collection_cakes`).
- Owner **+ New Order** / Order Workspace may select Master Library cakes with
  status `active` or `seasonal` via `listOfferableLibraryCakes()`, independent of
  Collection membership. Does not auto-add to Collection or mutate `collection_cakes`.

### Sources / crew / phone

- Staff create sources: jotform, whatsapp, whitebird_instagram, wee, lex, other
  (`customer_website` not offered). Website-origin source stays locked on edit.
- `crew_order` is not a source; later display `(crew)` takes precedence.
- Staff-created / non-website guest phone may be blank; customer website
  submission still requires WhatsApp phone.
- Manual sources do **not** automatically receive August Promo
  (`customer_website`-only eligibility unchanged).

### Pickup

- One order = one pickup date.
- `pickup_time` remains a sortable Postgres `time`.
- Optional `pickup_instruction` column may still hold historical free-text
  (e.g. older “Before 3pm” values). **Owner UI no longer creates or displays it**
  (see 2026-08-09 pickup instruction retirement). Crew/Confirmation Time use
  structured `pickupTime` only.
- Owner may use any valid clock time; customer storefront remains public-slot-only.
- Custom pickup does not auto-set Bakery Attention.

### Operational fields

- `include_receipt` = physical receipt with cake — independent of
  `email_submission_receipt_requested`.
- `needs_bakery_attention` + `bakery_attention_note` are explicit structured data;
  never inferred from free-text notes or pickup instruction.
- Ready / Picked Up (`ready_at`/`ready_by`, `picked_up_at`/`picked_up_by`) are
  operational state, **not** financial `order_status`. Owner-gated RPC/actions
  exist; Calendar/Ready UI deferred to later slices.

### Operations board

- Default sort: **Latest Orders — Newest First** (`created_at` desc).
- Clear Filters restores that default.
- Realtime does not change the selected sort.

### Storefront cart

- Customer may temporarily have zero cakes while editing (including remove last cake).
- Empty cart: Total RM0; intentional empty state; submission blocked until ≥1 cake.
- Server/RPC still rejects empty submitted orders.

## 2026-08-08 — Milestone 3 Preview 3A-2 · Owner staff-created guest orders

- Owner Operations: **+ New Order** → `/owner/orders/new`.
- Atomic RPC `create_staff_guest_preorder` creates normal guest orders
  (`customer_id` null, status `submitted`). Source cannot be `customer_website`.
- Phone optional for staff-created / non-website orders; website checkout and
  website-origin edit still require phone.
- Source edit rule: `customer_website` locked; staff sources editable among
  staff allowlist; never convert to/from website casually.
- Owner cake picker: Master Library `active` + `seasonal` via
  `listOfferableLibraryCakes()` — **not** Collection membership. Storefront
  Collection filtering unchanged; `collection_cakes` not mutated.
- Owner pickup: any valid clock `pickup_time` (sortable). Optional
  `pickup_instruction` may exist historically; Owner UI no longer exposes it
  (see 2026-08-09 retirement). Website checkout remains public-slot-only. Does
  not auto-set Bakery Attention.
- No automatic August Promo / payment / confirmation on create.

## 2026-08-08 — Milestone 3 Preview 3A-1 · Operational foundation

Schema/domain foundation for later Calendar / Ready UI. Product-tested as part of
the 3A-1/2 closed checkpoint above.

## 2026-08-07 — Milestone 3 Preview 2 · Final closed behaviour (Product-tested)

Milestone 3 Preview 2 is closed. Preview 3A-1 foundation may proceed; Calendar UI
and later Preview 3 slices are not started from this decision alone.

Final lifecycle corrections after checkpoint `9068d2fb` were Product-browser-tested
and committed separately. These principles supersede earlier Preview 2 notes that
said orders/discounts freeze after payment or that Payment Request always asks for
the full Amount Due.

### Lifecycle principles

1. **Payment does not freeze an order.** Active preorders remain editable through
   `submitted`, `pending_confirmation`, `awaiting_payment`, and `paid`.
   Verified payment records themselves remain immutable.

2. **Verified payments are historical facts.** Never rewrite/delete verified
   payments or allocations because the order or discount changes later.
   Settlement recalculates around money already received.

3. **Discounts do not freeze after payment.** Staff may Change/Remove discounts
   after payment via compensating adjustments; preserve the audit trail.

4. **Settlement determines current financial position** after order/discount amendment:
   - `netReceived < amountDue` → Awaiting Payment
   - `netReceived = amountDue` → Paid · Preorder Secured
   - `netReceived > amountDue` → Paid · Preorder Secured + Overpaid (no auto-refund)

5. **Outstanding-balance Payment Request.** With no prior payment, request full
   Amount Due. When prior verified payment exists and balance remains, request
   only `remainingBalance` (message shows Cake Total / effective discount /
   Amount Due / Payment Received / Balance to Pay). No normal Payment Request
   when Balance = RM0 or Overpaid.

6. **Overpayment.** Show Overpaid clearly. Do not automatically refund or alter
   Received. Refund/payment-correction workflow is future work.

7. **Discount eligibility after amendment.** Do not automatically remove an
   already-granted discount when the amended order no longer meets normal rules.
   Staff controls Change/Remove. Soft eligibility warnings may inform staff
   without mutating financial history.

### Payments & settlement

- Additive financial model: `order_adjustments`, `payments`, `payment_allocations`, `refunds`.
- Amount due = immutable order-item price snapshots + signed adjustments.
- Never mutate historical `order_items.unit_price` for discounts or Library price edits.
- Payment request (WB QR / Online Transfer / Others+description) → deadline/hold → staff verifies slip → Record & Verify Payment.
- Partial / split payments via multiple verified payment + allocation rows.
- Paid when net received ≥ amount due. Label: **Paid · Preorder Secured** — not POS checkout, not picked up, not completed.
- Verified payments immutable in Preview 2 (no edit/delete UX). Corrections/refunds deferred.

### Discounts

- Generic `order_adjustments` are the only financial discount mechanism.
- Lifecycle: never delete/mutate adjustment amounts; reverse via compensating rows (`status`, `reverses_adjustment_id`).
- August Promo 2026 (`august_promo_2026`) is a temporary rule, not the architecture.
- RM10 physical Discount Cards use structured voucher registry + redemptions (not Library catalog vouchers).
- No stacking August Promo + RM10 on the same order.
- Change/Remove remains available after verified payment or Paid (compensating adjustments only).
- Customer Payment Request shows effective discounts only; staff retains full audit.

### Catalog / Collection

- Master Library Active ≠ automatically customer-facing.
- Customer-facing cakes require explicit Collection membership (`collection_cakes`).

### Customer contact

- Guest email is optional; WhatsApp phone remains required/primary.
- Checkbox preference `email_submission_receipt_requested` — when checked, email becomes required.
- Outbound **Preorder Submission Receipt** delivery deferred until an email provider is deliberately chosen.
- Do not call the submission email a confirmation. Lifecycle: Submitted → optional receipt → Whitebird review → confirmation → payment → Paid.
- WhatsApp deep links remain phone-number based. WhatsApp usernames deferred.

### Operations

- Default board order: **Latest Orders — Newest First** (`created_at` desc).
  Pickup Date — Earliest First remains available as a sort option.
- Staff may select other sorts deliberately; Realtime does not force-sort or reset the selected sort.
- Search: order number, name, full phone, last 4 digits. Pickup filters (All/Today/Tomorrow/This Week/Choose Date). Status filters. Clear resets defaults.
- Paid orders remain on Operations (future pickup still operational).
- No persistent NEW/unread tracking yet — Submitted status + Latest Orders is sufficient for now.
- Shared semantic status colours (Operations + Order Workspace):
  - Submitted → amber / warm orange (`warning`)
  - Waiting Customer Confirmation → blue (`info`)
  - Awaiting Payment → soft purple (`progress`)
  - Paid · Preorder Secured → green (`success`)
  - Red (`danger`) reserved for genuine exception copy (e.g. overdue), not a new order status

### Library cake-size identity / price history

- Edit Cake reconciles `library_cake_sizes` by stable ID: update in place, insert new, delete only unreferenced removed sizes.
- Never delete+recreate referenced size rows (FK `order_items_cake_size_id_fkey` / `ON DELETE RESTRICT` is correct).
- Library current price may change; historical order-item snapshots remain unchanged.
- Removing a size still referenced by `order_items` is blocked with a clear error (no size-level archive column yet; cake Active/inactive remains the storefront gate).

### Deferred (not Preview 2)

- Refund / payment-correction workflow (including handling of Overpaid)
- Actual submission receipt email delivery / provider
- WhatsApp username support
- Persistent NEW/unread Operations tracking
- POS checkout / pickup completion / Bakery workspace
- EXTRA Hold for Walk-in / Walk-in EXTRA recording
- Generic Promotions admin / Business Settings
- Voucher photo storage / OCR
- Studio / Collection Builder
- Multi-order payment allocation UI
- Automatic last-minute 15-minute classification

## 2026-08-07 — Milestone 3 Preview 2 · Discount lifecycle (change/remove)

- Discounts are changed/removed via compensating adjustments — never delete or mutate amounts.
- Original rows keep amounts; lifecycle `status` becomes `reversed`; reversal row links via `reverses_adjustment_id`.
- Customer Payment Request shows effective discounts only; staff timeline retains full audit.
- Superseded: earlier note that Change/Remove was blocked after payment — final Product decision keeps discounts mutable after payment (see Final closed behaviour).
- Atomic RPC replaces August Promo with RM10 voucher redemption.

## 2026-08-07 — Milestone 3 Preview 2 · Discounts & adjustments

- Generic `order_adjustments` remain the financial mechanism (signed amounts; never mutate item price snapshots).
- August Promo 2026 is a temporary rule implementation (`august_promo_2026`), not the architecture.
- RM10 physical discount cards use a structured voucher registry + redemption records (not Library catalog vouchers).
- No stacking August Promo + RM10 on the same order in Preview 2.
- Superseded: earlier note that adjustments were blocked after payment — final Product decision keeps discount Change/Remove available after payment via compensating rows.
- Applied adjustment amounts are never silently deleted or rewritten.
- RM10 card issuance suppression retains reason codes for later Counter/Bakery.
- Not in Preview 2: refunds UI, payment corrections, multi-order allocation, POS, Bakery, EXTRA Hold for Walk-in.

## 2026-08-07 — Milestone 3 Preview 1 · Payment foundation

- Additive financial model: `order_adjustments`, `payments`, `payment_allocations`, `refunds`.
- Amount due = item price snapshots + adjustments; never mutate historical item prices for discounts.
- Payment request (WB QR / Online Transfer) → deadline → staff verifies slip → Record & Verify Payment.
- Partial / split payments via multiple payment + allocation rows; Paid when net received ≥ amount due.
- `paid` means preorder financially secured — not POS checkout / picked up / completed.
- Verified payments immutable in Preview 1 (no edit/delete UX).
- Not in Preview 1: August Promo UI, vouchers, refunds UI, corrections UI, multi-order allocation UI, POS.

## 2026-08-07 — Milestone 2 · Customer Confirmation

- Multi-cake preorder on unified `orders` / `order_items` (shared pickup).
- Item commercial snapshots (`cake_name`, `size_label`, `unit_price`).
- Collection-aware complimentary items with per-order snapshots.
- Prepare Confirmation → WhatsApp handoff → Mark as Sent → Waiting Customer Confirmation.
- Customer Confirmed event → Awaiting Payment (no payment collection).
- Immutable confirmation snapshots + outdated-on-edit behaviour.
- Order timeline / audit foundation for meaningful business events.
- No Milestone 3 / payment / Bakery.

## 2026-08-07 — Milestone 1.1 · Product Review refinement

- Cake detail: contained hero, compact info column, boutique composition (real data only).
- Customer language: Your Preorder; no guest/review wording; compact summary; denser form.
- Success: order recap + lightweight next-step journey (not Milestone 2 statuses).
- Operations: Supabase Realtime on `orders` + 30s reconcile; in-app toast for new preorders only.
- Order Workspace: View Mode by default; Edit Order → Save/Cancel; Confirm Order from View Mode.
- Header title Operations when on `/owner`.
- No Milestone 2 features.

## 2026-08-06 — Milestone 1.1 · First Order polish

- Premium cake detail (two-column desktop, size cards, Preorder This Cake).
- Real Library fields only (Sharing Guide / allergens when present).
- Centralized Whitebird pickup slots (weekday rules); no free-form times.
- Owner nav: Operations; hide unfinished workspace links.
- Order Workspace: edit customer/order/pickup/notes + Save Changes; Confirm Order retained.
- No Milestone 2 features.

## 2026-08-06 — Milestone 1 · Architectural unify (mandatory)

- One order system only: `orders` + `order_items`. Guests have `customer_id = null`
  with `guest_name` / `guest_phone` / `guest_email`. Future membership attaches
  `customer_id` to the same order rows — never duplicate guest/member tables.
- One cake system only: Master Library (`library_cakes`). Collections offer cakes
  via `collection_cakes` (availability), never duplicated cake records.
- Removed `guest_orders`, `guest_order_items`, and Milestone 1 `cakes` / `cake_sizes`.
- Owner UI labels: `submitted` → Submitted; `pending_confirmation` → Waiting
  Customer Confirmation. Customer workflow unchanged.

## 2026-08-06 — Milestone 1 · First Order

- First production workflow: guest preorder on customer site → Owner confirms.
- Customer pages: `/` collection home, `/cakes/[id]`, `/order`, `/order/success`.
- Owner workspace: `/owner` new orders dashboard, `/owner/orders/[id]` confirm.
- Statuses only: Submitted → Waiting Customer Confirmation.
- Catalog: `collections` + `collection_cakes` → Master Library.
- Seed: `npm run seed:milestone1` after migrations. Owner login via existing
  username auth (`owner` / seed password) → redirects to `/owner`.

## 2026-08-06 — Cake Library · Size pricing (Round 2 correction)

- Remove standalone Cake **Price**. Pricing lives only on structured size rows:
  Size + Price (e.g. 4" — RM78, 6" — RM135).
- At least one size required. This is the only cake pricing model.
- Supersedes the Round 1 “single cake price” decision.
- Product approved (2026-08-06). UI label is **Size** (not “Size Label”).

## 2026-08-06 — Cake Library · Price and Story

- **Base Price** → **Price** was an interim step; superseded by size pricing above.
- Remove **Story** from Cake Library.
- Target cake fields: Name, Cake Family (future), Description, Sharing Guide,
  Sizes (label + price), Photos, Bakery Notes, Allergens, Status.
- Category remains interim until Cake Family ships.
- Product approved Round 1 (2026-08-06). Treat Category as temporary; Cake Family
  will replace it as a permanent business object — no implementation yet.

## 2026-08-06 — Cake Library · Sharing Guide

- Rename Serving Guide → **Sharing Guide** (optional text). Reflects Whitebird’s
  view that cakes have no exact serving count; portions depend on cut and preference.
- Avoid fixed “Serves 6–8” style messaging.
- Future: Cake Families may define a default Sharing Guide; individual cakes may
  override. Not implemented yet.
- Product approved (2026-08-06). Include in Foundation Sprint A commit when Library
  usability review is complete.

## 2026-08-06 — Foundation Sprint A · Master Library (Product approved)

- Library is a permanent business foundation, independent of Studio. Studio will
  consume Library; Library must never depend on Studio. Fully usable without Studio.
- Collections will assemble reusable assets from Library by reference — they must
  not duplicate Library business data.
- Keep Library as a standalone workspace. Do not fold it into Studio prematurely.
- Cake status implementation stays as-is for now. **Seasonal** remains a future
  product review item (seasonality may move to Collections rather than Cake).
- Future: Cakes will belong to a permanent Cake Family (e.g. Sponge, Naked,
  Burnt Cheesecake, Celebration Extras). No implementation yet; keep schema
  flexible for a later family relationship.
- Two asset ownership concepts (not implemented yet): **permanent** assets
  (e.g. Birthday/Wishes Card, Crochet Flower, Standard Candle) vs
  **collection-controlled** assets (cakes, promotions, homepage hero, seasonal
  vouchers). Do not assume everything belongs to a Collection.
- Image URL fields are accepted for Foundation Sprint A. No Storage uploads yet.
- No commit until Product reviews Library in real usage.

## 2026-08-06 — Foundation Sprint A · Master Library

- Master Library is a staff workspace at `/library`, separate from Management and Studio.
- Sections: Cakes, Promotions, Vouchers, Assets. Full CRUD. Owner and Manager only.
- Tables: `library_cakes` (+ sizes, photos), `library_promotions`, `library_vouchers`, `library_assets`.
- Image fields store URLs for now. Supabase Storage upload is deferred.
- No Collection Builder, planning, launch workflow, or auto-save.
- Planning vs customer preorder availability remains a Studio principle — not implemented here.

## 2026-08-05 — V0.5-P11 Experience Polish

- Polish only: fewer clicks, clearer transitions, tighter hierarchy.
- After operational actions, stay on Amy’s celebration instead of bouncing to the board.
- Handoffs deep-link into the next workspace’s Amy order. No Management or Studio.

## 2026-08-05 — V0.5-P10 Connected Order Journey

- Public `/preview` hub walks one preorder across Website → Customer Operations → Bakery → Collection.
- Journey state is URL `step=` only. No backend or persistence.
- Official workspace name is Collection; Counter is the physical desk. Preview route is `/preview/collection`.
- One Order, One Owner: after Collection accepts (Customer Arrives), Amy leaves the Bakery Ready for Counter lane.
- Packing checklists stay reminder-only. Delivery / Dine-In action variants and Management are not in this sprint.

## 2026-08-05 — V0.5-P9 Counter Workspace Preview 1

- Public `/preview/collection` is a CEO click-through prototype for Collection at the desk.
- One workflow: Ready for Counter → Customer Arrives → Verify Order → Mark Collected → Completed.
- Counter verifies packing; Bakery prepares packing. Checklist is visual only.
- Guest name is primary on Counter cards (handover). Cake remains visible.
- Chrome uses Collection workspace naming. URL state: `arrived` / `verified` / `collected` (Amy only).
- No Management, backend, or persistence. Do not polish Bakery further beyond the packing checklist.

## 2026-08-05 — V0.5-P8 Bakery Workspace Preview 1

- Public `/preview/bakery` is a CEO click-through prototype, not live Bakery.
- One workflow: Ready to Start → Start Production → In Production → Mark Ready → Ready for Counter.
- Board is production-first (cake, size, time, notes). No guest CRM, payment, or WhatsApp.
- Ready for Counter is the Bakery outbound lane. Counter workspace is not built in this sprint.
- Packing is Bakery’s responsibility; Counter verifies. Bakery shows a visual packing checklist only.
- Guest name stays on Bakery cards as an identifier; cake remains first.
- Start Production → Mark Ready only. No Continue Production step.
- URL state: `started` / `ready` (Amy only). Mock data, no persistence.
- Do not polish Customer Operations further in this sprint.

## 2026-08-05 — V0.5-P7 Payment Verification Workflow

- After payment request is sent, Amy leaves “Celebrations needing you” and sits only under Awaiting Payment until a receipt arrives.
- Preview-only control simulates inbound receipt until WhatsApp exists.
- Receipt review is mock (method, reference, amount). No image upload, gateway, or QR.
- Verify Payment moves the celebration to Ready for Bakery. Customer Operations stops there — no Bakery workspace yet.
- Payment card Total Payable is always the amount actually payable (RM105), never the pre-promotion cake price.
- Currency is RM everywhere, including the customer website.
- URL state: `sent` / `confirmed` / `payment` / `receipt` / `verified` (Amy only).
- Amount Payable visual emphasis on the customer payment message is backlog only.

## 2026-08-05 — V0.5-P6 Payment Request Workflow

- After guest confirmation, status is Awaiting Payment; RNA is Send Payment Request, then Wait for Payment after send.
- Payment preview is a prepared message (not WhatsApp), same Prepare → Preview → Mark as Sent pattern.
- Currency in this preview workflow is RM (amount payable RM105 after August promotion).
- No receipt upload, verification, refunds, or multiple payments in this sprint.
- URL state: `sent` / `confirmed` / `payment` (Amy only).

## 2026-08-05 — V0.5-P5a Customer Operations Polish

- Workflow statuses (operational, not DB): Needs Review, Waiting for Customer, Awaiting Payment, Payment Verification, Ready for Bakery.
- Collection: staff Pickup / Delivery / Dine-In; customer Take Home / Arrange Transport / Celebrate With Us. Show both on the order.
- Order Health is separate from workflow status: Healthy / Waiting / Needs Attention.
- First celebration badge: “✨ First Celebration”.
- Confirmation remains Prepare → Preview → (future) Send via WhatsApp.
- Payment Workspace is V0.5-P6, after this polish is approved.

## 2026-08-05 — V0.5-P5 Customer Operations Preview 1

- Public `/preview/customer-operations` is a CEO click-through prototype, not live CO.
- Does not replace authenticated `/customer-operations` or touch order types / DB.
- Collection language matches the customer site: Take Home, Arrange Transport, Celebrate With Us.
- “Waiting for Customer” and “Ready for Bakery” exist only in preview mock data.
- Confirmation preview is a prepared message, not WhatsApp.
- Workflow state is URL-only (`?sent=amy`) — no persistence.

## 2026-08-04 — V0.4-P4 Basic Order Journey

- End-to-end mock preorder: Home → Browse → Detail → `/order` → Thank You.
- Collection methods: Celebrate With Us, Take Home, Arrange Transport.
- Date/time and confirmation use mock data only (URL-encoded thank-you payload).
- No payment, backend, Supabase, WhatsApp, or accounts.

## 2026-08-04 — V0.4-P3 Cake Detail

- `/browse/[id]` is a public confidence page (story first, commerce second).
- Size choice updates price focus only — no cart, payment, or order wiring on the detail page itself.
- “Start This Celebration” continues to `/order` with cake + size query params.
- Classics show “Not This Month” with mock next-collection copy.

## 2026-08-04 — V0.4-P2 Browse Cakes

- `/browse` is a public inspiration page (not an ecommerce catalogue).
- Mock cakes only; View Details links to `/browse/[id]`.
- Homepage “Browse Cakes” links to `/browse`.

## 2026-08-04 — ENG-002A customer homepage

- `/` is the customer-facing Whitebird homepage (not WOS staff marketing).
- Staff entry remains `/login` → authenticated AppShell.
- Fresh Picks availability states are mock-driven via `FRESH_PICKS_DEMO` until a later sprint.

## 2026-08-03 — Auth fetch timeouts must abort

- Middleware and server Supabase clients use `AbortSignal.timeout` on fetch.
- `Promise.race` timeouts alone are insufficient: abandoned `getUser()` calls can exhaust the process until public routes hang.
- Public paths (`/`, `/login`) still skip Supabase entirely.
- `getSessionStaff` is React `cache()`-scoped per request to avoid duplicate auth work in nested layouts.

## 2026-08-03 — V0.3 Preview 1 Order Foundation (Sprint 1.1)

- Orders live under Customer Operations (`/customer-operations/orders`).
- Order numbers: `ORD-YYYYMMDD-####` allocated in Asia/Singapore via `allocate_order_number()`.
- No products/line items yet (Sprint 2).
- Status includes Completed as a placeholder value; UI does not set it in this sprint.
- Payment Refunded is a placeholder value; UI does not set it in this sprint.
- Soft cancel only (status = cancelled); no hard deletes.
- CO section tabs: Customers | Orders (shell navigation unchanged).
- Fulfilment methods: Pickup, Delivery, Drive-through.
- Payment may be recorded only after Confirm (or Awaiting Payment).

## 2026-08-03 — Foundation Pack 1 shared UI

- Reusable UI primitives live under `src/components/ui/` for future modules.
- Toast provider mounts in authenticated `AppShellFrame` only.
- Shell `EmptyState` re-exports the shared UI empty state (same API, additive props).
- Date helpers default to Asia/Singapore (`en-SG`) in `src/lib/dates.ts`.
- Status/toast tones are design tokens in `globals.css` + `src/lib/design-tokens.ts`.
- Customer Operations pages are not migrated onto these primitives in this pack.

## 2026-08-03 — WhatsApp preferred contact identifiers

- Preferred Contact = WhatsApp is valid when a phone number **or** a WhatsApp username is present.
- Staff may contact the customer on WhatsApp using either identifier; a username is not required when a phone number exists.

## 2026-08-02 — V0.2 Preview 1 customer foundation

- Customer Operations workspace: list, profile, add/edit customer, addresses, search.
- Tables: `customers`, `customer_addresses` with RLS for authenticated staff.
- Orders and Timeline shown as Coming in V0.3 placeholders only.

## 2026-08-02 — V0.1.1 application shell

- Authenticated routes use a reusable AppShell (sidebar, mobile bottom nav, header).
- Workspace navigation visibility is centralized in `foundation/navigation/workspaces.ts` by role.
- Only Home is implemented; other visible workspaces show as “Coming later”.
- No fake business metrics or operational modules.

## 2026-08-02 — Task 002 staff login

- App login identifier is always **username** (never email).
- Supabase Auth may store a real email on `auth.users` as an implementation detail; it is not the login identifier and is not shown on the login form.
- Single role per staff via `staff_profiles.role_id` (no `user_roles` in V1).
- No `audit_events` in Task 002.
- No staff provisioning UI; create accounts in Supabase (plus `npm run seed:dev` for local Owner).
- Post-login destination: minimal authenticated Home only.

## 2026-08-02 — Sprint 1 foundation scope

- Single Next.js application (no monorepo).
- Absolute imports via `@/*`.
- Source layout under `src/` with `foundation/`, `engines/`, `workspaces/`, `components/`, `lib/`, `types/`.
- ESLint and Prettier both required.
- No database, Supabase, or authentication in Sprint 1.

## 2026-08-02 — Deferred platform decisions

- Sprint 2 introduces Supabase and schema: `staff_profiles`, `roles`, `user_roles`, `audit_events` (no `timeline_events` yet).
- Sprint 3 introduces authentication: username + password; email optional on profile; `@supabase/ssr` approved.
- Public table name is `staff_profiles` (not `users`) to avoid confusion with `auth.users`.
- Official product name: Whitebird Operating System (WOS). Codename: Project Flour.
- Use "Bakery", never "Kitchen".
