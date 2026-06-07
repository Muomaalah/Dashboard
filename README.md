# Accra North · Commercial Performance Portal

A role-based commercial dashboard for the **Accra North Region** of Ghana Water,
covering four districts (Accra Northeast, Adenta, Dodowa, Agbogba) across 27 months
of billing, collection, non-revenue water (NRW), arrears and customer data.

Built as a React + Chart.js single-page frontend backed by a **Neon Postgres**
database through Vercel serverless functions. The data (the 27-month dataset, users,
entries, approvals, daily collection) lives in the database; the frontend reads/writes
it via `/api`. If the API is unreachable (local file serving, or before the DB is
seeded) it **falls back to bundled data + `localStorage`**, so it still runs offline.

## Run locally

It's a static site. From this folder:

```bash
python3 -m http.server 8181
# then open http://localhost:8181
```

(or open `index.html` through any static file server).

## Sign in

Access is role-gated. Demo accounts (all use the password `demo`) — click
**"Demo accounts"** on the login screen to one-tap sign in:

| Role | Email | Scope |
| --- | --- | --- |
| Regional Director | `director@gwl.gh` | Everything + user management; auto-approves entries |
| District Manager | `ne.manager@gwl.gh` (and adenta/dodowa/agbogba) | One district + approvals |
| Commercial Officer | `officer@gwl.gh` | Data entry only (no financials) |
| Auditor / Viewer | `audit@gwl.gh` | Read-only |

## What's inside

- **Overview** — 8 KPIs, billing vs collection & volume trends, collection-ratio /
  NRW small multiples, month-to-date district league table.
- **Billing & Collection** — stacked billing, YTD target-attainment gauges with
  pacing markers, 12-month collection efficiency, arrears analysis.
- **Arrears** — receivables KPIs, cumulative & net-new arrears, months-of-billing
  risk metric, MoM movement.
- **Non-Revenue Water** — NRW volume by district, vs-target bars, per-district
  small multiples, full 4×27 month heatmap.
- **Customers** — connections growth, metering ratio, growth-since-Jan-2024.
- **Daily Collection** — per-district daily logging with editable targets + trend.
- **Custom Analysis** — pick any 1–4 metrics × districts × range; auto multi-axis.
- **Data Entry** — monthly returns with live-derived KPIs and outlier detection.
- **Approvals** — submission → approval lifecycle with full audit trail.
- **Administration** — user & privilege management.
- **Inbox** (bell) — approvals, outlier alerts, performance forecasts &
  target-gap recommendations, system notifications.

**Power-BI-style interactions:** a global period picker and click-to-cross-filter
(click a district, KPI, chart line or x-axis point to focus the whole dashboard).

## Tech & structure

```
index.html        # all styling (inline CSS) + script tags
app/
  data.js         # the Accra North dataset (window.DASHBOARD_DATA)
  auth.jsx        # login + role-based access control
  charts.jsx      # Chart.js helpers, color palette, formatters
  filters.jsx     # period picker + cross-filter context
  lifecycle.jsx   # outlier detection, forecasting, inbox builder
  overview.jsx    # Overview + shared chart components (small multiples, etc.)
  views.jsx       # Billing & Collection, NRW, Customers
  custom.jsx      # Arrears + Custom Analysis
  daily.jsx       # Daily Collection
  entry.jsx       # Data Entry + Admin
  inbox.jsx       # Inbox bell + Approvals queue
  app.jsx         # app shell, sidebar nav, routing, CSV export
data-source/      # original spreadsheet the dataset was derived from
```

React 18, Chart.js 4 and `chartjs-plugin-datalabels` load from CDN. JSX is
transpiled in the browser by Babel standalone.

### Optional: precompile for production

The browser logs *"You are using the in-browser Babel transformer"*. To remove it
and speed up first load, precompile the JSX to plain JS (requires Node):

```bash
npx @babel/cli --presets @babel/preset-react app --out-dir app --extensions ".jsx" --out-file-extension .js
```

then point the `<script>` tags at the generated `.js` files and remove the Babel
standalone `<script>`. (Each file keeps its own scope, so load order must stay the
same and the cross-file `window.*` exports must remain.)

## Backend & database (Neon Postgres on Vercel)

Vercel serverless functions back the app with Neon:

- `api/bootstrap.js` — `GET /api/bootstrap`: dataset + users + entries + daily + targets
- `api/state.js` — `PUT /api/state {key,value}`: upsert a mutable key (users / entries / daily / daily_targets)
- `api/health.js` — `GET /api/health`: DB connectivity + what's seeded
- `api/_db.js` — shared Neon client (reads `DATABASE_URL`)

State is one `app_state(key, value jsonb)` table (`db/schema.sql`) — the same key→JSON
model the app used in `localStorage`, so the frontend logic is unchanged; only the
storage backend (`app/store.js`) moved to Neon.

## Deploy to the "dashboard" project

1. **Connect Neon** — Vercel → project **dashboard** → **Storage** → attach your Neon
   database. This injects `DATABASE_URL` into the project.
2. **Seed the current data** (locally, with that connection string):
   ```bash
   npm install
   DATABASE_URL="postgres://…neon.tech/…?sslmode=require" npm run seed
   ```
3. **Deploy:**
   ```bash
   vercel --prod      # link to the existing "dashboard" project when prompted
   ```
   …or push to a Git repo connected to that project.
4. **Verify:** open `/api/health` — it should list the seeded keys
   (`dataset`, `users`, `entries`, `daily`, `daily_targets`).

> **Before real-world use:** `/api/state` is currently unauthenticated (the app trusts
> the client, as the prototype did) and demo passwords are stored in plaintext. Add
> server-side auth + password hashing to harden it.
