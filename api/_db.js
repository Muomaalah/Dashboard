// Shared Neon Postgres connection for the serverless API.
// Files in /api that start with "_" are NOT routed as endpoints — this is a helper.
import { neon } from '@neondatabase/serverless';

// The Vercel ↔ Neon integration injects DATABASE_URL (and POSTGRES_URL aliases).
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

// Lazy init: neon() throws if called with no connection string, which would
// crash the function at import time (FUNCTION_INVOCATION_FAILED). Initialising
// on first use lets handlers return a clean JSON error instead.
let _client = null;
export function sql(strings, ...values) {
  if (!_client) {
    if (!connectionString) {
      throw new Error('Database not configured: attach Neon to this Vercel project (Storage tab) so DATABASE_URL is set, then redeploy.');
    }
    _client = neon(connectionString);
  }
  return _client(strings, ...values);
}

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
