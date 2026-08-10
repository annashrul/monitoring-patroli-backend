import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireRole, getScopeFilter } from '../middleware/auth.js';
import { getCurrentShiftInfo } from '../services/shiftService.js';

const router = Router();

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const normalize = (s) => ({
  id: s.id,
  name: s.name,
  start_time: String(s.start_time).slice(0, 5),
  end_time: String(s.end_time).slice(0, 5),
  site_id: s.site_id || null,
  is_active: s.is_active,
});

// GET /api/shifts — admin & satpam, admin dengan site_id hanya lihat shift sitenya
router.get('/', async (req, res) => {
  let query = supabase.from('shifts').select('*').order('start_time');
  const scope = await getScopeFilter(req);
  if (scope) {
    query = query.or(`site_id.eq.${scope},site_id.is.null`);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ message: 'Gagal mengambil data shift' });
  res.json({ data: (data || []).map(normalize) });
});

// GET /api/shifts/current — admin & satpam
router.get('/current', async (req, res) => {
  try {
    const { shift, period } = await getCurrentShiftInfo();
    res.json({
      data: {
        shift: shift ? normalize(shift) : null,
        period: period
          ? { start: period.start.toISOString(), end: period.end.toISOString() }
          : null,
      },
    });
  } catch {
    res.status(500).json({ message: 'Gagal menentukan shift aktif' });
  }
});

// POST /api/shifts — admin & owner
router.post('/', requireRole('admin', 'owner'), async (req, res) => {
  const { name, start_time, end_time, site_id } = req.body || {};
  if (!name || !TIME_RE.test(start_time || '') || !TIME_RE.test(end_time || '')) {
    return res.status(400).json({ message: 'Nama dan jam (format HH:MM) wajib diisi dengan benar' });
  }
  const insertData = { name, start_time, end_time };
  if (site_id) insertData.site_id = site_id;
  const { data, error } = await supabase
    .from('shifts')
    .insert(insertData)
    .select()
    .single();
  if (error) return res.status(500).json({ message: 'Gagal membuat shift' });
  res.status(201).json({ data: normalize(data) });
});

// PUT /api/shifts/:id — admin & owner
router.put('/:id', requireRole('admin', 'owner'), async (req, res) => {
  const { name, start_time, end_time, site_id, is_active } = req.body || {};
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (start_time !== undefined) {
    if (!TIME_RE.test(start_time)) return res.status(400).json({ message: 'Format jam harus HH:MM' });
    updates.start_time = start_time;
  }
  if (end_time !== undefined) {
    if (!TIME_RE.test(end_time)) return res.status(400).json({ message: 'Format jam harus HH:MM' });
    updates.end_time = end_time;
  }
  if (site_id !== undefined) updates.site_id = site_id || null;
  if (is_active !== undefined) updates.is_active = !!is_active;

  const { data, error } = await supabase
    .from('shifts')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  if (error) return res.status(500).json({ message: 'Gagal mengubah shift' });
  if (!data) return res.status(404).json({ message: 'Shift tidak ditemukan' });
  res.json({ data: normalize(data) });
});

// DELETE /api/shifts/:id — admin & owner
router.delete('/:id', requireRole('admin', 'owner'), async (req, res) => {
  const { error } = await supabase.from('shifts').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ message: 'Gagal menghapus shift' });
  res.json({ data: { id: req.params.id } });
});

export default router;
