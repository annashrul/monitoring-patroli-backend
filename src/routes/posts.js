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
router.get('/', async (req, res) => {
  try {
    if (req.query.all === 'true' && req.user?.role === 'owner') {
      const { data: allPosts } = await supabase.from('posts').select('*').order('created_at');
      if (!allPosts?.length) return res.json({ data: [] });

      let period = null;
      try {
        const shiftService = await import('../services/shiftService.js');
        ({ period } = await shiftService.getCurrentShiftInfo());
      } catch { period = null; }

      const lastByPost = new Map();
      if (period) {
        const { data: logs } = await supabase
          .from('scan_logs')
          .select('post_id, scanned_at, users(name)')
          .in('post_id', allPosts.map((p) => p.id))
          .eq('status', 'ok')
          .gte('scanned_at', period.start.toISOString())
          .lt('scanned_at', period.end.toISOString())
          .order('scanned_at', { ascending: false });
        for (const log of logs || []) {
          if (!lastByPost.has(log.post_id)) {
            lastByPost.set(log.post_id, {
              scanned_at: log.scanned_at,
              scanned_by_name: log.users?.name ?? '-',
            });
          }
        }
      }

      const data = allPosts.map((p) => ({
        id: p.id,
        site_id: p.site_id,
        name: p.name,
        latitude: p.latitude,
        longitude: p.longitude,
        radius_m: p.radius_m,
        is_active: p.is_active,
        status: lastByPost.has(p.id) ? 'scanned' : 'pending',
        last_scan: lastByPost.get(p.id) ?? null,
      }));
      return res.json({ data });
    }

    const siteId = req.query.site_id;
    if (!siteId) return res.status(400).json({ message: 'site_id atau all=true diperlukan' });
    const posts = await getPostsWithStatus(siteId);
    res.json({ data: posts });
  } catch (e) {
    res.status(500).json({ message: 'Gagal mengambil data pos' });
  }
});

// POST /api/posts — admin
router.post('/', requireRole('admin'), async (req, res) => {
  const { site_id, name, latitude, longitude, radius_m } = req.body || {};
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
  const { data, error } = await supabase
    .from('posts')
    .insert({ site_id, name, latitude, longitude, radius_m, qr_token })
    .select()
    .single();

  if (error) return res.status(500).json({ message: 'Gagal membuat pos' });
  emitPostsChanged(req, site_id);
  res.status(201).json({ data });
});

// PUT /api/posts/:id — admin
router.put('/:id', requireRole('admin'), async (req, res) => {
  const { data: existing } = await supabase
    .from('posts')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!existing) return res.status(404).json({ message: 'Pos tidak ditemukan' });

  const { name, latitude, longitude, radius_m, is_active } = req.body || {};
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

// DELETE /api/posts/:id — admin
router.delete('/:id', requireRole('admin'), async (req, res) => {
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
