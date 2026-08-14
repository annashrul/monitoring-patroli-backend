import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../supabase.js';
import { requireRole, getScopeFilter } from '../middleware/auth.js';
import { isPointInPolygon } from '../utils/geo.js';
import { getPostsWithStatus } from '../services/postStatus.js';

const router = Router();

function emitPostsChanged(req, siteId) {
  req.app.get('io')?.emit('posts:changed', { site_id: siteId });
}

function validLatLng(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function validRadius(r) {
  return Number.isInteger(r) && r >= 5 && r <= 500;
}

// GET /api/posts?all=true — owner lihat semua posts dari semua site dengan status
// Query opsional: search, page, limit
router.get('/', async (req, res) => {
  try {
    if (req.query.all === 'true' && req.user?.role === 'owner') {
      const page = parseInt(req.query.page, 10);
      const limit = parseInt(req.query.limit, 10);

      const { data, total } = await getPostsWithStatus(null, {
        search: req.query.search ? String(req.query.search).trim() : '',
        page: Number.isInteger(page) && page > 0 ? page : undefined,
        limit: Number.isInteger(limit) && limit > 0 ? limit : undefined,
        includeQrToken: true,
      });

      const meta = page && limit
        ? { page, limit, total, total_pages: Math.ceil(total / limit) }
        : { total };

      return res.json({ data, meta });
    }

    const siteId = req.query.site_id;
    if (!siteId) return res.status(400).json({ message: 'site_id atau all=true diperlukan' });
    const page = parseInt(req.query.page, 10);
    const limit = parseInt(req.query.limit, 10);
    const { data: posts, total } = await getPostsWithStatus(siteId, {
      search: req.query.search ? String(req.query.search).trim() : '',
      page: Number.isInteger(page) && page > 0 ? page : undefined,
      limit: Number.isInteger(limit) && limit > 0 ? limit : undefined,
      includeQrToken: req.user?.role === 'admin' || req.user?.role === 'owner',
    });

    const meta = page && limit
      ? { page, limit, total, total_pages: Math.ceil(total / limit) }
      : { total };

    res.json({ data: posts, meta });
  } catch (e) {
    res.status(500).json({ message: 'Gagal mengambil data pos' });
  }
});

// POST /api/posts — admin & owner
router.post('/', requireRole('admin', 'owner'), async (req, res) => {
  const { site_id, name, latitude, longitude, radius_m, interval_minutes } = req.body || {};
  if (!site_id || !name || !validLatLng(latitude, longitude) || !validRadius(radius_m)) {
    return res
      .status(400)
      .json({ message: 'Data pos tidak lengkap/valid (radius harus 5-500 meter)' });
  }

  const { data: site } = await supabase.from('sites').select('*').eq('id', site_id).maybeSingle();
  if (!site) return res.status(404).json({ message: 'Site tidak ditemukan' });

  if (!isPointInPolygon(latitude, longitude, site.polygon)) {
    return res.status(400).json({ message: 'Titik pos berada di luar area (polygon) site' });
  }

  const qr_token = crypto.randomBytes(16).toString('hex');
  const interval = (interval_minutes != null && interval_minutes >= 10 && interval_minutes <= 1440) ? interval_minutes : 120;
  const { data, error } = await supabase
    .from('posts')
    .insert({ site_id, name, latitude, longitude, radius_m, qr_token, interval_minutes: interval })
    .select()
    .single();

  if (error) return res.status(500).json({ message: 'Gagal membuat pos' });
  emitPostsChanged(req, site_id);
  res.status(201).json({ data });
});

// PUT /api/posts/:id — admin & owner
router.put('/:id', requireRole('admin', 'owner'), async (req, res) => {
  const { data: existing } = await supabase
    .from('posts')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!existing) return res.status(404).json({ message: 'Pos tidak ditemukan' });

  const { name, latitude, longitude, radius_m, interval_minutes, is_active } = req.body || {};
  const newLat = latitude !== undefined ? latitude : existing.latitude;
  const newLng = longitude !== undefined ? longitude : existing.longitude;

  if (!validLatLng(newLat, newLng)) {
    return res.status(400).json({ message: 'Koordinat tidak valid' });
  }
  if (radius_m !== undefined && !validRadius(radius_m)) {
    return res.status(400).json({ message: 'Radius harus 5-500 meter' });
  }

  const { data: site } = await supabase
    .from('sites')
    .select('*')
    .eq('id', existing.site_id)
    .maybeSingle();
  if (site && !isPointInPolygon(newLat, newLng, site.polygon)) {
    return res.status(400).json({ message: 'Titik pos berada di luar area (polygon) site' });
  }

  const updates = { latitude: newLat, longitude: newLng };
  if (name !== undefined) updates.name = name;
  if (radius_m !== undefined) updates.radius_m = radius_m;
  if (interval_minutes !== undefined) updates.interval_minutes = interval_minutes;
  if (is_active !== undefined) updates.is_active = !!is_active;

  const { data, error } = await supabase
    .from('posts')
    .update(updates)
    .eq('id', existing.id)
    .select()
    .single();

  if (error) return res.status(500).json({ message: 'Gagal mengubah pos' });
  emitPostsChanged(req, existing.site_id);
  res.json({ data });
});

// DELETE /api/posts/:id — admin & owner
router.delete('/:id', requireRole('admin', 'owner'), async (req, res) => {
  const { data: existing } = await supabase
    .from('posts')
    .select('id, site_id')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!existing) return res.status(404).json({ message: 'Pos tidak ditemukan' });

  const { error } = await supabase.from('posts').delete().eq('id', existing.id);
  if (error) return res.status(500).json({ message: 'Gagal menghapus pos' });
  emitPostsChanged(req, existing.site_id);
  res.json({ data: { id: existing.id } });
});

export default router;
