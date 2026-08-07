# Architecture

Whitebird Operating System (WOS) — internal codename Project Flour.

## Layers

### Foundation

Authentication, users (staff profiles), roles, audit, timeline.

### Core Engines

Business Rules, Business Calendar, Menu, Capacity, Order Validation, Task, Responsibility, Suggestion.

### Workspaces

Home, Owner (Milestone 1 guest-order dashboard), Customer Operations, Bakery,
Collection, Library (Master Library foundation), Management.

## Application layout

```
src/
  app/           # Next.js App Router
  foundation/    # Foundation layer
  engines/       # Core engine layer
  workspaces/    # Workspace layer
  components/    # Shared UI
  lib/           # Shared utilities
  types/         # Shared TypeScript types
```

Future modules extend this architecture; they do not replace it.

Shared UI primitives for workspaces live under `src/components/ui/`
(Foundation Pack 1). Shell chrome remains under `src/components/shell/`.

Master Library (`/library`) holds reusable cakes, promotions, vouchers, and
assets. It is engineering foundation for future Studio — not Operations Center,
not Collection Builder, and not the final Studio UX.

Library is a permanent business foundation. Studio will consume Library by
reference; Library must remain fully usable without Studio and must never depend
on Studio. Collections will assemble Library records rather than duplicate them.
Not all assets are collection-controlled — permanent catalog assets are a
separate future concept. Cake Family is a planned relationship (not implemented).

Milestone 1 storefront offers cakes from Master Library through `collections` +
`collection_cakes`. Guest preorders write to the unified `orders` /
`order_items` tables with `customer_id` null. Customer Operations continues to
use the same `orders` table for staff-created member orders (`customer_id` set).

> Sprint 1 established application structure. Supabase and authentication arrived
> in later sprints.
