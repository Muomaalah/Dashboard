// PUT /api/state  { key, value } — upserts one app-state key.
// Only mutable keys are writable; the base "dataset" is seeded, not written here.
import { sql, ensure } from './_db.js';

const ALLOWED = new Set(['users', 'entries', 'daily', 'daily_targets']);

export default async function handler(req, res) {
  if (req.method !== 'PUT' && req.method !== 'POST') {
    res.setHeader('Allow', 'PUT, POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { key, value } = body;
    if (!ALLOWED.has(key)) { res.status(400).json({ error: 'Unknown or read-only key' }); return; }
    if (value === undefined) { res.status(400).json({ error: 'Missing value' }); return; }
    await ensure();
    await sql`insert into app_state (key, value, updated_at)
              values (${key}, ${JSON.stringify(value)}::jsonb, now())
              on conflict (key) do update set value = excluded.value, updated_at = now()`;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
