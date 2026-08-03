# Decisions

Record of durable project decisions. Newest first.

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
