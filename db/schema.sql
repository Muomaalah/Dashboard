-- Accra North Commercial Dashboard — Neon Postgres schema
--
-- A single key/value table holds all app state as JSONB. This mirrors the
-- client's original localStorage model exactly, so the frontend logic is
-- unchanged — only the storage backend moved to Neon.

create table if not exists app_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Keys the app uses:
--   dataset        the 27-month base dataset (shape of window.DASHBOARD_DATA)  [read-only ref]
--   users          [] of user accounts
--   entries        [] of monthly data-entry submissions (status/history/outliers)
--   daily          [] of daily-collection entries
--   daily_targets  { DISTRICT: amount }
--
-- Seed it with:  DATABASE_URL=... node scripts/seed.mjs
