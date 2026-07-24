import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../supabase.js';
import { requireRole } from '../middleware/auth.js';
import { isPointInPolygon } from '../utils/geo.js';

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
