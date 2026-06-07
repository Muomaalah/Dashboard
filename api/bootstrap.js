// GET /api/bootstrap — returns the full app state the frontend needs at load.
import { sql, ensure } from './_db.js';

export default async function handler(req, res) {
  try {
    await ensure();
    const rows = await sql`select key, value from app_state`;
    const map = {};
    for (const r of rows) map[r.key] = r.value;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      dataset: map.dataset || null,
      users: map.users || [],
      entries: map.entries || [],
      daily: map.daily || [],
      dailyTargets: map.daily_targets || null,
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
