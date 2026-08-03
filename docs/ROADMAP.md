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

## Sprint 3+ — Later

- Core engines
- Workspace implementations
- Business rules as configurable engine-owned logic
