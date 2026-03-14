# MedLink Admin Web Dashboard (React)

React + Vite admin dashboard connected to your existing Supabase backend.

## Stack

- React 18 + Vite
- Tailwind CSS (futuristic premium UI)
- TanStack Query (server state + caching)
- TanStack Table (data table rendering)
- Supabase JS SDK

## Features

- Persistent auth session (stays logged in after refresh)
- Sticky top navbar + sticky full-height side menu
- Collapsible side menu with logo-first mode
- Dashboard page with statistics cards and expanded operational metrics
- Dashboard page with colorful cards, shortcuts, and advanced charts
- Role-based pages:
  - `dashboard` (analytics for doctors, hospitals, appointments)
    - chart suite: pie, line, area, bar, radar
  - `specializations` (super admin CRUD + image upload)
  - `hospital` (hospital doctors table + assign/remove + super admin signup-doctor assignment)
- Skeleton loading states for table fetches
- Query-based refresh/invalidation after mutations

## Required Backend Migrations

Make sure these are already pushed:

- `supabase/migrations/20260312230000_admin_web_dashboard_rpcs.sql`
- `supabase/migrations/20260312234000_super_admin_hospital_page_access.sql`
- `supabase/migrations/20260313140000_admin_dashboard_signup_doctors_and_stats.sql`

## Run Locally

From `admin-web-dashboard`:

```powershell
npm install
npm run dev
```

Then open the shown URL (usually `http://127.0.0.1:5173`).

## Production Build

```powershell
npm run build
npm run preview
```

## Supabase Config

Update values in `src/lib/supabase.js` if you switch project:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Roles & Access

- `super_admin`
  - Full specialization management
  - Full hospital assignment flow from all signup doctors
  - Global dashboard metrics
- `hospital_admin`
  - Hospital doctor management for assigned hospital
  - Hospital-scoped dashboard metrics

## Notes

- Doctor "create" is assignment of an existing doctor account by email (safe browser flow).
- Creating new Auth users is intentionally not performed from client-side browser code.
