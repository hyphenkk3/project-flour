# Architecture

Whitebird Operating System (WOS) — internal codename Project Flour.

## Layers

### Foundation

Authentication, users (staff profiles), roles, audit, timeline.

### Core Engines

Business Rules, Business Calendar, Menu, Capacity, Order Validation, Task, Responsibility, Suggestion.

### Workspaces

Home, Customer Operations, Bakery, Collection, Management, Owner.

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

> Sprint 1 establishes application structure only. Supabase and authentication arrive in later sprints.
