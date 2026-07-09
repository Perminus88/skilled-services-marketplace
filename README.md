# Skilled Services Marketplace

A marketplace connecting clients with verified skilled-trade artisans (plumbers, electricians, cleaners, etc.) in Kenya. Built with Next.js 14 App Router, Supabase (Postgres + Auth + PostGIS), TypeScript, and Tailwind CSS.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Requires a `.env.local` with Supabase project credentials (see `.env.example` if present, or ask a maintainer).

## Architecture notes

- **Route groups**: `(artisan)` and `(client)` folders are Next.js route groups — they organize files but don't appear in the URL. `src/app/client/signup/page.tsx` (no parens) is a real path segment, resolving to `/client/signup`.
- **Writes** (INSERT/UPDATE) go through API routes using the Supabase service role key, which bypasses RLS. This applies to both artisan and client registration.
- **RLS**: `users`, `artisan_profiles`, and `artisan_categories` only allow `SELECT` of your own row. The discovery page reads other users' data through `/api/discovery/*` routes (service role key), not directly from the browser client.

## Schema gotchas (custom Postgres enums — not plain text/booleans)

- `users.role`: `client` | `artisan` | `admin`
- `users.verification_status`: `pending` | `verified` | `rejected` — **not** `approved`
- `artisan_profiles.availability`: `available` | `busy` | `offline` — **not** a boolean
- `artisan_profiles.base_location`: `geography(Point, 4326)` — use `ST_Distance` with `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`, not `::geometry`

The `handle_new_user()` trigger on `auth.users` sets `role` from signup metadata (`options.data.role` passed to `supabase.auth.signUp()`), defaulting to `'artisan'` if not provided.

## Status

- ✅ Artisan onboarding, email confirmation, login, status page
- ✅ Client discovery page (search, filter, geolocation, PostGIS distance sort)
- 🔧 Client signup/login (built, in testing)
- ⬜ Booking flow + M-Pesa STK Push
- ⬜ Admin dashboard