# ระบบบันทึกการลา (Leave Management System)

A mobile-first, installable (PWA) leave-request/approval app for a small organization (~20 people, 2 team leads). Thai UI, red/white theme. Full spec: [docs/PROMPT.md](docs/PROMPT.md).

**Stack:** Next.js 14 (App Router, TypeScript, strict) · Supabase (Postgres + Row Level Security + Google OAuth) · Resend (email) · exceljs (Excel export) · Tailwind CSS · Vercel (deploy).

## Features

- Google sign-in, first-login onboarding (team selection)
- Three roles: `admin`, `approver` (team lead), `user` — approval chain is derived from team leads, with a per-user override table for special cases
- Leave request form with realtime day-count preview (half-day periods, holidays and weekends excluded), draft/submit/edit/cancel
- Approvers get approve/reject/return (with required note) on their team's pending requests, plus a "save and approve" shortcut for their own leave
- Search, per-request detail + status timeline, dashboard summary
- Email notifications (new request -> approver, decision -> requester)
- Reports with filters + Excel export (dates rendered in Buddhist Era)
- Admin settings: teams & team leads, users & roles, approver overrides, leave types, holidays
- Dates are stored as Gregorian (CE) everywhere in the DB and converted to Buddhist Era (BE, +543) only at display time

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- A [Resend](https://resend.com) account (for email notifications — optional for local dev, the app degrades gracefully without it)
- A Google Cloud OAuth client (for Google sign-in)

## 1. Supabase setup

1. Create a new Supabase project.
2. **Run the migrations** (in order) against your project — either via the SQL Editor (paste each file's contents and run) or the Supabase CLI:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   Migration files run in filename order — `supabase/migrations/`:
   - `0001_tables.sql` — extension + all tables
   - `0002_functions.sql` — `auth_role()`/`auth_team_id()` RLS helpers, `calc_total_days()`, `gen_request_no()`
   - `0003_triggers.sql` — `updated_at`, privileged-field guard, team-change guard, request_no generation, overlap check, total_days freeze, status-change audit log
   - `0004_policies.sql` — RLS enabled + every policy
   - `0005_grants.sql` — table-level grants to `authenticated`
   - `0006_seed.sql` — ทีม A, leave types, 2026 fixed-date holidays
   - `0007_approver_visibility.sql` — follow-up fix so a plain `user` can see their own approver's name
3. **Enable Google OAuth**: Supabase Dashboard → Authentication → Providers → Google. You'll need a Google Cloud OAuth 2.0 Client ID/Secret (see below). Set the Supabase-provided callback URL as an authorized redirect URI in Google Cloud.
4. **Set the site URL and redirect URLs**: Authentication → URL Configuration.
   - Site URL: your app's URL (e.g. `https://your-app.vercel.app`, or `http://localhost:3000` for local dev)
   - Redirect URLs: add `http://localhost:3000/auth/callback` and `https://your-app.vercel.app/auth/callback`
5. Copy your project's **URL**, **anon key**, and **service role key** from Project Settings → API — you'll need these for `.env.local`.

### Google Cloud OAuth client

1. [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth client ID (type: Web application).
2. Authorized redirect URI: the callback URL shown on Supabase's Google provider settings page (looks like `https://<project-ref>.supabase.co/auth/v1/callback`).
3. Copy the Client ID/Secret into Supabase's Google provider settings.

## 2. Resend setup (optional for local dev)

1. Create an API key at [resend.com/api-keys](https://resend.com/api-keys).
2. Verify a sending domain (or use Resend's test mode while developing).
3. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in your env — see below. Without `RESEND_API_KEY` set, the app logs a warning and skips sending instead of failing the request.

## 3. Environment variables

Copy `.env.example` to `.env.local` and fill in real values:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=            # Project Settings > API
NEXT_PUBLIC_SUPABASE_ANON_KEY=       # Project Settings > API
SUPABASE_SERVICE_ROLE_KEY=           # Project Settings > API — server-only, never expose to the client
RESEND_API_KEY=
RESEND_FROM_EMAIL="Leave System <noreply@yourdomain.com>"
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`.env.local` is git-ignored (see `.gitignore` — `.env*` is excluded except the explicitly force-added `.env.example`). **Never commit real secrets.** In Vercel, set these as Project → Settings → Environment Variables instead, with separate values for Production and Preview if you use different Supabase projects per environment.

## 4. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. First Google sign-in creates your `users` row and sends you to team selection. To become an `admin`, update your row's `role` directly in the Supabase SQL Editor for the first account:

```sql
update users set role = 'admin' where email = 'you@yourcompany.com';
```

(RLS intentionally blocks a client from ever self-promoting to `admin`/`approver` — see [Security notes](#security-notes) below. After the first admin exists, promote everyone else from Settings → ผู้ใช้งานและสิทธิ์.)

## 5. Deploy to Vercel

1. Push this repo to GitHub (already done if you're reading this from the repo) and import it in Vercel.
2. Framework preset: Next.js (auto-detected).
3. Add the environment variables from step 3 in Vercel's project settings — use your **production** Supabase project's values for the Production environment, and consider a separate Supabase project for Preview/staging if you want deploy previews to not touch production data.
4. Add your Vercel domain to Supabase's Redirect URLs (Authentication → URL Configuration) and as an authorized redirect URI wherever needed.
5. Deploy.

`vercel.json` pins the deployed functions to the `bom1` (Mumbai) region — match this to whichever region your Supabase project actually lives in (Project Settings → General → Region). Every page does at least one auth check plus one or more DB queries against Supabase; if the function region and the database region are on different continents, that round-trip latency compounds and the whole app feels sluggish on every navigation. Co-locating them is the single biggest lever for perceived speed here.

## Development

```bash
npm run dev         # start dev server
npm run build        # production build
npm run lint          # eslint
npm run typecheck    # tsc --noEmit, strict mode
```

## Security notes

- **RLS is the real access-control boundary**, enforced at the database level for every table (see `supabase/migrations/0004_policies.sql`) — scoped by role/team, not just filtered in the UI. API routes re-check auth/role server-side too, but RLS is the backstop even if a route had a bug.
- **Service role key never reaches the client.** `lib/supabase/admin.ts` is guarded with the `server-only` package, which fails the build if it's ever imported from client code. It's used narrowly (e.g. resolving an approver's email to notify — a lookup a plain `user` can't otherwise make via RLS).
- **No client-side privilege escalation**: the `users` table's self-insert RLS policy forces `role='user'`/`is_active=true` on account creation; a `role`/`is_active` change is additionally blocked by a trigger unless the actor is already an admin. New leave requests must start as `status='draft'` — a client can't insert directly into `pending`/`approved`.
- **Status transitions are transactional with an optimistic lock**: every transition is a single `UPDATE ... WHERE id = $1 AND status = ANY($2)`, which is atomic in Postgres and reports a conflict (409) instead of clobbering a status another actor already changed (e.g. two team leads approving at once). See `lib/leave-requests.ts`.
- **Input validation** with `zod` on the leave-request create/edit API routes, both client and server side.
- **Rate limiting** on mutating API routes (`lib/rate-limit.ts`) — a basic in-memory per-user limiter to blunt accidental double-submits/runaway scripts. It's not distributed (resets per instance/deploy), which is an acceptable trade-off for this app's size; swap in a shared store (e.g. Upstash Redis) if that ever matters.
- **Security headers**: CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` — all static, set in `next.config.mjs`. (A per-request nonce-based CSP was tried first but reverted: Next.js's own injected scripts didn't reliably pick up the nonce, breaking all client-side JS in both dev and production. `script-src` stays same-origin only; `'unsafe-eval'` is added only in dev, for Fast Refresh.)
- **Email templates escape all user-controlled strings** (names, reasons, approver notes) before interpolating into HTML, to prevent injection in the recipient's email client (`lib/email.ts`).
- **Master data is soft-delete only** (`teams`, `leave_types`, `users` — `is_active` flag, `ON DELETE RESTRICT` foreign keys) so historical leave requests always still resolve correctly even after a team/leave-type/user is deactivated.
- Run `npm audit` periodically. As of this build there are a handful of advisories in Next 14's own bundled dependencies and dev-only tooling (`eslint-config-next`'s `glob`, `exceljs`'s `uuid`) with no practical exploit path in how this app uses them; they'll clear once the project can move past Next 14 (currently pinned per spec) or upstream patches land.

## Project structure

```
supabase/migrations/     SQL migrations (run in order)
src/app/(app)/            Authenticated pages (dashboard, leave-requests, reports, settings, profile)
src/app/api/               API routes (leave-request status transitions, Excel export)
src/app/login, auth/      Public auth pages + OAuth callback
src/components/            Shared UI (shadcn-style primitives, nav, date picker)
src/lib/                   Supabase clients, auth helpers, date/status utilities, email, rate limiting
scripts/                   One-off scripts (PWA icon generator)
```
