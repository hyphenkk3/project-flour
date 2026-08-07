# Decisions

Record of durable project decisions. Newest first.

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
