import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireRole, getScopeFilter } from '../middleware/auth.js';
import { getPostsWithStatus } from '../services/postStatus.js';

const router = Router();

function emitPostsChanged(req, siteId) {
  req.app.get('io')?.emit('posts:changed', { site_id: siteId });
}

function emitSitesChanged(req) {
  req.app.get('io')?.emit('sites:changed', {});
}

function isValidPolygon(polygon) {
  return (
    Array.isArray(polygon) &&
    polygon.length >= 3 &&
    polygon.every(
      (p) =>
        p &&
        typeof p.lat === 'number' &&
        typeof p.lng === 'number' &&
        p.lat >= -90 &&
        p.lat <= 90 &&
        p.lng >= -180 &&
        p.lng <= 180
    )
  );
}

// GET /api/sites — admin & owner lihat semua, satpam hanya lihat yang aktif,
// admin dengan site_id hanya lihat site-nya sendiri
router.get('/', async (req, res) => {
  let query = supabase.from('sites').select('*').order('created_at');
  const scope = await getScopeFilter(req);
  if (scope) {
    query = query.eq('id', scope);
  } else if (req.user?.role === 'satpam') {
    query = query.eq('is_active', true);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ message: 'Gagal mengambil data site' });
  res.json({ data });
});

// GET /api/sites/:siteId/posts — admin & satpam (qr_token hanya untuk admin)
// admin dengan site_id hanya bisa akses posts di site-nya
router.get('/:siteId/posts', async (req, res) => {
  try {
    const scope = await getScopeFilter(req);
    if (scope && req.params.siteId !== scope) {
      return res.status(403).json({ message: 'Anda tidak memiliki akses ke site ini' });
    }
    const posts = await getPostsWithStatus(req.params.siteId);
    const isAdmin = req.user.role === 'admin' || req.user.role === 'owner';
    const data = posts.map((p) => ({
      id: p.id,
      site_id: p.site_id,
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      radius_m: p.radius_m,
      ...(isAdmin ? { qr_token: p.qr_token } : {}),
      is_active: p.is_active,
      status: p.status,
      last_scan: p.last_scan,
    }));
    res.json({ data });
  } catch {
    res.status(500).json({ message: 'Gagal mengambil data pos' });
  }
});

// POST /api/sites — admin
router.post('/', requireRole('admin'), async (req, res) => {
  const { name, polygon } = req.body || {};
  if (!name || !isValidPolygon(polygon)) {
    return res
      .status(400)
      .json({ message: 'Nama dan polygon (minimal 3 titik) wajib diisi dengan benar' });
  }
  const { data, error } = await supabase.from('sites').insert({ name, polygon }).select().single();
  if (error) return res.status(500).json({ message: 'Gagal membuat site' });
  emitPostsChanged(req, data.id);
  emitSitesChanged(req);
  res.status(201).json({ data });
});

// PUT /api/sites/:id — admin
router.put('/:id', requireRole('admin'), async (req, res) => {
  const { name, polygon, is_active } = req.body || {};
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (polygon !== undefined) {
    if (!isValidPolygon(polygon)) {
      return res.status(400).json({ message: 'Polygon tidak valid (minimal 3 titik)' });
    }
    updates.polygon = polygon;
  }
  if (is_active !== undefined) updates.is_active = !!is_active;

  const { data, error } = await supabase
    .from('sites')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  if (error) return res.status(500).json({ message: 'Gagal mengubah site' });
  if (!data) return res.status(404).json({ message: 'Site tidak ditemukan' });
  emitPostsChanged(req, data.id);
  emitSitesChanged(req);
  res.json({ data });
});

// DELETE /api/sites/:id — admin (ditolak jika masih punya posts)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { count } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('site_id', req.params.id);

  if ((count || 0) > 0) {
    return res
      .status(400)
      .json({ message: 'Site masih memiliki titik pos, hapus pos terlebih dahulu' });
  }

  const { error } = await supabase.from('sites').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ message: 'Gagal menghapus site' });
  emitPostsChanged(req, req.params.id);
  emitSitesChanged(req);
  res.json({ data: { id: req.params.id } });
});

export default router;
