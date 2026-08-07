# Roadmap

## Sprint 1 — Application foundation (current)

- Next.js (App Router)
- TypeScript (strict)
- Tailwind CSS
- Project folder structure under `src/`
- Basic homepage
- ESLint + Prettier
- Local build
- Vercel deployment

## Sprint 2 / Task 002 — Staff login

- Supabase Auth + PostgreSQL schema (`roles`, `staff_profiles`)
- Username + password login
- Session via `@supabase/ssr`
- Minimal authenticated Home
- Dev Owner seed (`npm run seed:dev`)

## V0.1.1 — Application shell

- Reusable authenticated AppShell
- Role-aware workspace navigation (Home only active)
- Mobile bottom navigation + desktop sidebar

## V0.2 Preview 1 — Customer Foundation

- Customer Operations: customers, addresses, search
- Orders / Timeline placeholders for V0.3

## Foundation Pack 1 — Shared UI infrastructure

- Breadcrumb, toast, confirm dialog, status badge
- Shared empty state, skeletons, form controls, page section
- Date helpers + status design tokens
- No Orders; Customers left unchanged

## V0.3 Preview 1 — Order Foundation (Sprint 1.1)

- Orders entity + Customer Operations Orders routes
- Create / list / search / detail / confirm / payment status
- No products, Bakery, Collection, or Timeline

## ENG-002A — Customer website homepage (Sprint 2.1)

- Public `/` is the Whitebird customer homepage (order experience entry).
- Not an ecommerce shop; Browse / Order Journey / Fresh Picks pages deferred.
- Fresh Picks card uses mock `FRESH_PICKS_DEMO` for four UI states.
- Staff login remains at `/login`.

## V0.4-P2 — Browse Cakes

- Public `/browse` inspiration gallery (Available Now + Whitebird Classics).
- Mock cake data only; no search, filters, or backend.
- View Details links to Cake Detail (`/browse/[id]`).

## V0.4-P3 — Cake Detail

- Public `/browse/[id]` decision page (story, flavour, sizes, price, availability).
- Mock detail data; Start This Celebration → `/order`.
- No payment, WhatsApp, or backend.

## V0.4-P4 — Basic Order Journey

- Public `/order` preorder form + `/order/thank-you` (mock only).
- Customer details, collection method, date/time, summary.
- No payment, Supabase, WhatsApp, or customer accounts.

## V0.5-P5 — Customer Operations Preview 1

- Public product prototype at `/preview/customer-operations`.
- One click-through workflow: Needs Review → Order Workspace → Send Confirmation → Waiting for Customer.
- Mock data only; no backend, persistence, payment, Bakery, or Management.

## V0.5-P5a — Customer Operations Polish

- Same preview workflow; experience-only refinement.
- Official work statuses, dual collection language, Order Health, warmer RNA + relationship card.
- No Payment, Bakery, backend, or persistence.

## V0.5-P6 — Payment Request Workflow

- Preview only: Waiting for Customer → Confirmed → Awaiting Payment → payment message preview → Mark as Sent.
- Read-only payment summary (RM). No receipt upload, verification, refunds, or Bakery.

## V0.5-P7 — Payment Verification Workflow

- Preview only: Awaiting Payment → receipt submitted → review receipt → Verify Payment → Ready for Bakery.
- Mock receipt review. No gateway, QR, persistence, Bakery, or Counter.

## V0.5-P8 — Bakery Workspace Preview 1

- Public prototype at `/preview/bakery`.
- Today’s Production board → order workspace → Start Production → Mark Ready → Ready for Counter.
- Visual packing checklist before Mark Ready. Mock data only.

## V0.5-P9 — Counter Workspace Preview 1

- Public prototype at `/preview/collection` (workspace name: Collection).
- Desk board → arrive → verify order → mark collected → completed.
- Mock data only. No Management, backend, or persistence.

## V0.5-P10 — Connected Order Journey

- Public hub at `/preview` connects Website → Customer Operations → Bakery → Collection.
- One mock preorder (Amy · Chocolate D’Amour). URL `step` only. No Management.

## V0.5-P11 — Experience Polish

- Same connected journey. No new features, no Management, no Whitebird Studio.
- Stay on Amy’s celebration after actions. Clearer handoffs and hierarchy.

## Foundation Sprint A — Master Library

- Staff `/library` CRUD for cakes, promotions, vouchers, and assets.
- Reusable business objects for future Studio. No Collection Builder.

## Milestone 1 — First Order

- Guest preorder on customer website → Owner dashboard → Confirm Order.
- Statuses: Submitted → Waiting Customer Confirmation.
- Production workflow only; no payment, membership, or other workspaces.

## Sprint 3+ — Later

- Core engines
- Workspace implementations
- Business rules as configurable engine-owned logic
