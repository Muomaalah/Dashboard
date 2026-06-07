// Seed the Neon database with the current dashboard data.
//
//   DATABASE_URL="postgres://...neon.tech/..." node scripts/seed.mjs
//
// Safe to re-run: it refreshes `dataset` + `users`, but never wipes live
// `entries` / `daily` / `daily_targets` once they exist.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { neon } from '@neondatabase/serverless';

const __dirname = dirname(fileURLToPath(import.meta.url));
const conn =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED;
if (!conn) {
  console.error('✗ Set DATABASE_URL to your Neon connection string and re-run.');
  process.exit(1);
}
const sql = neon(conn);

// The dataset lives in app/data.js as `window.DASHBOARD_DATA = { ... };`
const dataJs = readFileSync(join(__dirname, '..', 'app', 'data.js'), 'utf8');
const jsonText = dataJs.slice(dataJs.indexOf('=') + 1).trim().replace(/;\s*$/, '');
const dataset = JSON.parse(jsonText);

const SEED_USERS = [
  { id: 'u1', email: 'director@gwl.gh',        name: 'Adwoa Mensah',   role: 'director', district: null,              password: 'demo' },
  { id: 'u2', email: 'ne.manager@gwl.gh',      name: 'Kwame Asante',   role: 'manager',  district: 'ACCRA NORTHEAST', password: 'demo' },
  { id: 'u3', email: 'adenta.manager@gwl.gh',  name: 'Akosua Boateng', role: 'manager',  district: 'ADENTA',          password: 'demo' },
  { id: 'u4', email: 'dodowa.manager@gwl.gh',  name: 'Yaw Owusu',      role: 'manager',  district: 'DODOWA',          password: 'demo' },
  { id: 'u5', email: 'agbogba.manager@gwl.gh', name: 'Ama Darko',      role: 'manager',  district: 'AGBOGBA',         password: 'demo' },
  { id: 'u6', email: 'officer@gwl.gh',         name: 'Kojo Appiah',    role: 'officer',  district: null,              password: 'demo' },
  { id: 'u7', email: 'audit@gwl.gh',           name: 'Esi Tetteh',     role: 'auditor',  district: null,              password: 'demo' },
];
const DAILY_TARGETS = { 'ACCRA NORTHEAST': 380000, 'ADENTA': 280000, 'DODOWA': 90000, 'AGBOGBA': 140000 };

async function put(key, value) {
  await sql`insert into app_state (key, value, updated_at)
            values (${key}, ${JSON.stringify(value)}::jsonb, now())
            on conflict (key) do update set value = excluded.value, updated_at = now()`;
  console.log('  ✓ seeded', key);
}

(async () => {
  console.log('Creating table app_state…');
  await sql`create table if not exists app_state (
    key text primary key, value jsonb not null, updated_at timestamptz not null default now()
  )`;

  console.log('Seeding reference data…');
  await put('dataset', dataset);
  await put('users', SEED_USERS);

  const existing = await sql`select key from app_state where key in ('entries','daily','daily_targets')`;
  const have = new Set(existing.map(r => r.key));
  if (!have.has('entries'))       await put('entries', []);
  if (!have.has('daily'))         await put('daily', []);
  if (!have.has('daily_targets')) await put('daily_targets', DAILY_TARGETS);

  console.log('✓ Done. Open the app — it will load from Neon.');
})().catch(e => { console.error('✗ Seed failed:', e); process.exit(1); });
