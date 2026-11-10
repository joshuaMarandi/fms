# MDV Fleet Management System

Role-based web app where a company's fleet, drivers, inspections, daily use, expenses, training, HR records and safety data live in one place. Built from the MDV FMS2 requirements: every field, checkbox, radio, dropdown and reminder from sections 1 to 5 exists in the app.

Stack: Next.js (App Router, TypeScript) · Supabase (Postgres, Auth, Storage, Realtime, pg_cron, Edge Functions) · shadcn/ui · Tailwind CSS · TanStack Table · React Hook Form + Zod · Recharts. Installable PWA for drivers. All UI text lives in `src/i18n/en.json` (Swahili can be added in `sw.json`).

## 1. Setup

Requirements: Node 20.9+, npm, the Supabase CLI, Docker (for a local Supabase) or a self-hosted Supabase on your VPS.

```bash
npm install
cp .env.example .env.local        # fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### Local Supabase

```bash
npm run db:start                  # starts Postgres, Auth, Storage, Studio in Docker
npm run db:reset                  # applies supabase/migrations and supabase/seed.sql
npm run db:types                  # regenerates src/lib/database.types.ts
npm run dev                       # http://localhost:3000
```

`supabase status` prints the API URL and anon key for `.env.local`.

### Self-hosted Supabase (VPS)

1. Link the project: `supabase link --project-ref <ref>` or point `supabase db push --db-url postgresql://...` at the VPS database.
2. Apply migrations: `supabase db push`. Load the seed once: `psql "$DB_URL" -f supabase/seed.sql` (demo data; remove the demo users and company afterwards if not wanted).
3. Create the storage buckets if `storage.buckets` was not writable during migration: vehicle-docs, driver-docs, inspection-scans, jmp, incident-files, forms (all private).
4. Deploy the Edge Functions and set their secrets:
   ```bash
   supabase functions deploy invite-user
   supabase functions deploy send-reminder-emails
   supabase secrets set RESEND_API_KEY=... REMINDER_FROM_EMAIL=fleet@yourdomain APP_URL=https://fms.yourdomain
   ```
   `SUPABASE_SERVICE_ROLE_KEY` is only ever used inside these functions.
5. For the daily email run, store the function URL and service key in Vault (see `supabase/migrations/20261110000500_cron_email_hook.sql`). The daily reminder job itself (`fms-process-reminders`, 06:00) is scheduled by the migration.
6. In Supabase Auth settings add `https://fms.yourdomain/auth/callback` to the redirect URLs and set the site URL.
7. Build and run the app: `npm run build && npm run start` behind your reverse proxy (or use the Dockerfile of your choice). Set `NEXT_PUBLIC_APP_URL`.

## 2. Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` | Anon (publishable) key; RLS protects everything |
| `NEXT_PUBLIC_APP_URL` | `.env.local` | Public URL used in invitation links |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function secrets only | Admin API for invitations and emails |
| `RESEND_API_KEY`, `REMINDER_FROM_EMAIL`, `APP_URL` | Edge Function secrets | Reminder emails |

## 3. Demo users (seed)

All passwords: `Password123!`

| Email | Role |
| --- | --- |
| owner@mdv.test | Owner (Platform pages: companies, packages, registrations) |
| fleetmanager@mdv.test | Admin (Fleet Manager), delegable ceiling: all five modules |
| coordinator@mdv.test | Fleet coordinator |
| hod@mdv.test | Head of department |
| driver1@mdv.test, driver2@mdv.test | Driver (linked to driver records) |
| hr@mdv.test | HR |
| requester@mdv.test | Requester |
| hse@mdv.test | HSE manager |
| controlroom@mdv.test | Control room operator |
| erc@mdv.test | Emergency response commander |

## 4. How access works

Access is data, not code. `resources` holds the module tree (keys like `expenses.tyres`), `roles` hold `role_grants` (resource, actions, scope), users hold one primary role and optional extra roles (union). The same check runs in three places:

- Database: `permission_scope(resource, action)` and `row_access(...)` inside every RLS policy; `approve_request`, `reject_request`, `sign_jmp` check `approve`; role editing triggers enforce the admin ceiling (`admin_ceilings`).
- Server: `requirePermission()` in pages, `session.can()`.
- Client: `useCan()` and `<Can resource action>` hide menu items, tabs, buttons and fields.

A grant on a parent key applies to its children unless a child has its own grant (longest prefix wins). Scopes: `all`, `department`, `own` (created by the user or linked to the user's driver record).

## 4a. SaaS: companies and packages

Each customer company is a tenant. Its Admin manages only that company; the Owner manages the platform.

- **Packages** (Platform, Packages): name, price, currency, billing period, the modules and submodules it unlocks, and the number of vehicles a company may manage. Public, active packages appear on the landing page pricing section.
- **Companies** (Platform, Companies): package, status (active, trial, pending, suspended, cancelled), subscription start and end, contacts, usage (vehicles against the limit, users, drivers, storage, last activity). The owner can invite the company's Admin, suspend or activate it, and "Open this company" to work inside it.
- **Registrations** (Platform, Registrations): companies that registered from `/register`. Approving creates the company with starter data and emails the contact an Admin invitation; rejecting needs a reason.
- **Overview** (Platform): active companies, pending registrations, vehicles and users across tenants, monthly recurring revenue, subscriptions ending soon, companies at their vehicle limit.

Enforcement lives in the database, so the UI cannot be bypassed:

- `permission_scope_for` returns nothing for a module outside the company's package (`package_allows`), or when the company is suspended, pending, cancelled or past its subscription end (`company_access_ok`). Dashboard and Settings are always included. The Owner is never restricted.
- `vehicles_limit` trigger blocks adding a vehicle once the package limit is reached.
- `companies_guard` lets only the Owner change a company's package, status or subscription dates; every change is written to the audit log.
- Anonymous visitors can read public packages and submit a registration, and nothing else.

Billing itself (invoices, payment collection) is not built; prices are shown and used for revenue figures only.

## 5. Adding a module or submodule

1. Add a row to `public.resources` (key, parent_key, name, label_prefix, path, icon, sort_order) in a migration or in `seed.sql`.
2. Create the table with the standard columns (`id, company_id, created_at, created_by, updated_at, updated_by, deleted_at`) and register it in `public.table_resources`; call `apply_standard_rls('table', 'resource.key')` (or `apply_child_rls` for repeatable rows) in the migration.
3. Describe the form and list once in `src/modules/*.ts` (a `ModuleDef`: schema with the controls from the spec, list columns, option sources) and add it to `src/modules/registry.ts`.
4. Add three route files under `src/app/(app)/<path>/`: `page.tsx` (ModuleListPage), `new/page.tsx` and `[id]/page.tsx` (ModuleRecordPage). Add its labels to `src/i18n/en.json` and a quick action in `src/components/shell/quick-action.tsx`.
5. Grant it to roles in Settings, Roles and access (or in `seed.sql`). Mark date columns that need reminders with a `sync_reminder` trigger.

## 6. Adding a role

Settings, Roles and access: Add role (optionally copy from an existing role), tick actions per module or submodule, pick a scope per row, save. The plain-language preview shows what the role can do. An Admin only sees rows inside their delegation ceiling and cannot grant what they do not hold; the database enforces the same rule.

## 7. Project layout

```
supabase/migrations     schema, permission engine, RLS, triggers, RPCs, reminders, storage policies
supabase/seed.sql       module tree, roles and grants, demo company and data
supabase/functions      invite-user, send-reminder-emails (Deno)
supabase/tests          rls_tests.sql: scopes, parent-child override, driver isolation, approvals, ceilings
src/app/(app)           pages; generic modules use ModuleListPage and ModuleRecordPage
src/modules             declarative module definitions (forms, columns, options)
src/components/patterns data table, schema form, repeatable rows, approval panel, attachments box, chips, signature, confirm dialog
src/components/shell    sidebar, topbar, breadcrumbs, command palette, notifications, profile menu
src/lib/permissions.ts  can(), permissionScope() shared by server and client
src/i18n                en.json (all UI text), sw.json
```

## 8. Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint`, `npm run typecheck` | ESLint, TypeScript (with route typegen) |
| `npm run check:style` | fails on emoji or CSS gradients anywhere in the codebase |
| `npm run db:reset`, `db:types`, `db:test` | reset and seed, regenerate types, run the SQL test suite |

## 9. Open questions

See `docs/OPEN_QUESTIONS.md` for the items the source document left open and the reading that was built.
