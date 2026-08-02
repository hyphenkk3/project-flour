# Project Flour

Whitebird Operating System (WOS) — operational platform for Whitebird Cake House.

## Stack

- Next.js (App Router)
- React
- TypeScript (strict)
- Tailwind CSS
- Supabase (Auth + PostgreSQL)
- ESLint + Prettier
- Vercel

## Setup

1. Copy `.env.example` to `.env.local` and fill Supabase values.
2. Apply `supabase/migrations` to your Supabase project.
3. Disable public sign-ups in Supabase Auth settings.
4. Seed the development Owner account:

```bash
npm run seed:dev
```

Dev login (username, not email):

- username: `owner`
- password: `OwnerDev123!`

## Scripts

```bash
npm install
npm run dev
npm run build
npm run lint
npm run format
npm run seed:dev
```

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Decisions](docs/DECISIONS.md)
