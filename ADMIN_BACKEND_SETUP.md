# Admin Backend Setup

This project now supports two admin storage modes:

1. `local-json`
   - Default fallback
   - Writes backend data into `SpeakNow/data/admin-db.json`
   - Good for local development and demos

2. `supabase`
   - Preferred production path
   - Activated automatically when both env vars exist:
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`

## Frontend admin access

The `/admin` page is only shown to users whose email appears in:

- `VITE_ADMIN_EMAILS`

Example:

```bash
VITE_ADMIN_EMAILS=admin@example.com,owner@example.com
```

## Optional API protection

If you want to protect `GET /api/admin-track` beyond frontend role checks, also set:

```bash
ADMIN_DASHBOARD_KEY=your-secret-value
```

Then enter the same key inside the `/admin` page before refreshing the dashboard.

## Supabase tables

Run this SQL file in Supabase SQL Editor:

`supabase/admin_schema.sql`

Run this app data SQL too:

`supabase/app_schema.sql`

It creates:
- `admin_users`
- `admin_events`
- `admin_voice_sessions`
- `admin_presentation_sessions`
- `app_users`
- `app_voice_sessions`
- `app_presentation_sessions`
- `app_activity_records`
- `app_settings`

It also adds:
- primary keys
- useful indexes for time/user lookups
- GIN indexes for JSON payload/report search

## Environment variables

Set these in your deployment environment:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_DASHBOARD_KEY=...
VITE_ADMIN_EMAILS=admin@example.com
```

## Current behavior

- If Supabase env vars are missing, the app falls back to `local-json`
- If Supabase env vars are present, `/api/admin-track` reads/writes through Supabase
- If Supabase env vars are present, `/api/local-data` also reads/writes through Supabase
- The admin dashboard at `/admin` shows the active provider
