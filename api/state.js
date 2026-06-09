// PUT /api/state  { key, value } — upserts one app-state key.
// "dataset" is seed-once: the app writes it on first run against an empty DB,
// after which it becomes read-only here (scripts/seed.mjs can still refresh it).
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
    if (value === undefined) { res.status(400).json({ error: 'Missing value' }); return; }
    await ensure();
    if (key === 'dataset') {
      const existing = await sql`select 1 from app_state where key = 'dataset'`;
      if (existing.length) { res.status(409).json({ error: 'dataset already seeded' }); return; }
    } else if (!ALLOWED.has(key)) {
      res.status(400).json({ error: 'Unknown or read-only key' }); return;
    }
    await sql`insert into app_state (key, value, updated_at)
              values (${key}, ${JSON.stringify(value)}::jsonb, now())
              on conflict (key) do update set value = excluded.value, updated_at = now()`;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
