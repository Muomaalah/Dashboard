// Shared Neon Postgres connection for the serverless API.
// Files in /api that start with "_" are NOT routed as endpoints — this is a helper.
import { neon } from '@neondatabase/serverless';

// The Vercel ↔ Neon integration injects DATABASE_URL (and POSTGRES_URL aliases).
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  console.error('[api] No database connection string. Set DATABASE_URL (Neon) in the Vercel project.');
}

export const sql = neon(connectionString);

// Create the table on demand (cheap; cached per warm instance).
let ensured = false;
export async function ensure() {
  if (ensured) return;
  await sql`create table if not exists app_state (
    key        text primary key,
    value      jsonb not null,
    updated_at timestamptz not null default now()
  )`;
  ensured = true;
}
