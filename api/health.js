// GET /api/health — quick check that the DB is reachable and what's seeded.
import { sql, ensure } from './_db.js';

export default async function handler(req, res) {
  try {
    await ensure();
    const rows = await sql`select key, jsonb_typeof(value) as type, updated_at
                           from app_state order by key`;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, seeded: rows.map(r => r.key), rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
}
