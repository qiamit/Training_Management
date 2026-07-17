# Quality International Training Platform

Vite + React + TypeScript + Tailwind SPA backed by **Supabase** (Auth, Postgres, Storage) and deployed on **Vercel**.

## Roles

| Portal | Roles |
|--------|--------|
| Quality International | `super_admin`, `trainer`, `employee` |
| Organization | `org_admin`, `org_employee` (employees use learner dashboard) |
| Individual | `individual` |

- QI staff signups (except bootstrap emails) stay **pending** until a super admin approves them as Employee or Trainer.
- Organization signup creates a tenant + `org_admin` (auto-approved).
- Org admins invite employees via link; invitees become `org_employee`.
- Individual signup joins the Independent Learners org (auto-approved).
- Bootstrap super admin email (default `amitrajput183@gmail.com`) is seeded in `bootstrap_super_admins`.

## Local setup

1. Create a Supabase project (or use an existing one).

2. Run the SQL migration in the Supabase SQL editor (or CLI):

```bash
# Option A: paste file contents in Dashboard → SQL
# supabase/migrations/20260712000000_init.sql

# Option B: Supabase CLI
npx supabase db push
```

3. In Supabase Auth settings, add redirect URL:

- `http://localhost:3000/auth/callback`
- Your Vercel URL + `/auth/callback`

4. Copy env and fill keys from Project Settings → API:

```bash
cp .env.example .env
```

5. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

1. Push this repo to GitHub.
2. Import the project in Vercel (Framework Preset: Vite).
3. Set environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SITE_URL` (your production URL)
- `VITE_BOOTSTRAP_SUPER_ADMIN_EMAILS` (optional; DB seed still applies)

`vercel.json` already rewrites all routes to `index.html` for SPA routing.

## Project structure

```
src/
  features/auth/     Auth provider + route guards
  lib/auth/          Role / portal config
  lib/supabase/      Client + types
  pages/             Landing, login, dashboards
  components/        Shell + brand
supabase/migrations/ Postgres schema, RLS, storage, signup trigger
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (port 3000) |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
