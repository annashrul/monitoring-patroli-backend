import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireRole, getScopeFilter } from '../middleware/auth.js';
import { startOfDayInTimezone } from '../utils/time.js';

const router = Router();

// GET /api/locations?user_id=&site_id=&date=YYYY-MM-DD&page=&limit= — admin/owner
// Mengembalikan riwayat lokasi satpam (satpam_locations), urut kronologis.
router.get('/', requireRole('admin', 'owner'), async (req, res) => {
  const { user_id, site_id, date } = req.query;
  const scope = await getScopeFilter(req);

  const page = parseInt(req.query.page, 10);
  const limit = parseInt(req.query.limit, 10) || 2000;
  const hasPagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;

  const select = 'id, user_id, latitude, longitude, recorded_at, user:users!inner(id, name, site_id)';

  let q = supabase
    .from('satpam_locations')
    .select(select, { count: 'exact' })
    .order('recorded_at', { ascending: true });

  const filterSite = site_id || scope;
  if (filterSite) q = q.eq('users.site_id', filterSite);
  if (user_id) q = q.eq('user_id', user_id);
  if (date) {
    const start = startOfDayInTimezone(date);
    if (start) {
      const end = new Date(start.getTime() + 86400000);
      q = q.gte('recorded_at', start.toISOString()).lt('recorded_at', end.toISOString());
    }
  }

  if (hasPagination) {
    q = q.range((page - 1) * limit, page * limit - 1);
  } else {
    q = q.limit(limit);
  }

  const { data, error, count } = await q;
  if (error) return res.status(500).json({ message: 'Gagal mengambil riwayat lokasi' });

  const mapped = (data || []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    latitude: row.latitude,
    longitude: row.longitude,
    recorded_at: row.recorded_at,
    user: row.user ? { id: row.user.id, name: row.user.name } : null,
  }));

  const total = count ?? mapped.length;
  const meta = hasPagination
    ? { page, limit, total, total_pages: Math.ceil(total / limit) }
    : { total };

  res.json({ data: mapped, meta });
});

export default router;
