This is the Quality International Training Platform starter built on [Next.js](https://nextjs.org) App Router + Supabase Auth.

## Getting Started

Create `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Then run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000), then choose one of the login portals:

- `/login/quality-international`
- `/login/organization`
- `/login/individual`

For email verification links, ensure Supabase Auth URL settings include your local URL and callback:

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/confirm`

## Role-based portal mapping

After sign in, the app validates `user.app_metadata.role` from Supabase Auth:

- `super_admin` -> Quality International dashboard
- `tenant_admin`, `quality_manager` -> Organization dashboard
- `employee`, `trainee` -> Employee dashboard

If a user signs in through the wrong portal, access is denied and the session is signed out.

## Pending approval flow

- Signup is available on each portal login page.
- New users can create an account and verify email.
- Until admin assigns `app_metadata.role`, login is blocked with "pending approval" message.
- Optional: set `app_metadata.approval_status = rejected` to block with explicit rejection message.
- Super Admin approval queue is available at `/dashboard/quality-international/user-approvals`.
