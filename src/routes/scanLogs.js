import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireRole, getScopeFilter } from '../middleware/auth.js';
import { startOfDayInTimezone } from '../utils/time.js';

const router = Router();

// GET /api/scan-logs?site_id=&post_id=&user_id=&date=YYYY-MM-DD&page=&limit= — admin
// admin dengan site_id otomatis difilter ke site-nya
// Query opsional: page, limit
router.get('/', requireRole('admin', 'owner'), async (req, res) => {
  const { site_id, post_id, user_id, date } = req.query;
  const scope = await getScopeFilter(req);

  const page = parseInt(req.query.page, 10);
  const limit = parseInt(req.query.limit, 10) || 20;
  const hasPagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;

  const postSelect = 'post:posts!inner(id, name, site_id)';
  const select = `id, scanned_at, status, distance_m, latitude, longitude, kondisi, checklist, catatan, foto_url, ${postSelect}, user:users(id, name)`;

  let q = supabase
    .from('scan_logs')
    .select(select, { count: 'exact' })
    .order('scanned_at', { ascending: false });

  const filterSite = site_id || scope;
  if (filterSite) q = q.eq('posts.site_id', filterSite);
  if (post_id) q = q.eq('post_id', post_id);
  if (user_id) q = q.eq('user_id', user_id);
  if (date) {
    const start = startOfDayInTimezone(date);
    if (start) {
      const end = new Date(start.getTime() + 86400000);
      q = q.gte('scanned_at', start.toISOString()).lt('scanned_at', end.toISOString());
    }
  }

  if (hasPagination) {
    q = q.range((page - 1) * limit, page * limit - 1);
  } else {
    q = q.limit(limit);
  }

  const { data, error, count } = await q;
  if (error) return res.status(500).json({ message: 'Gagal mengambil riwayat scan' });

  const mapped = (data || []).map((row) => ({
    id: row.id,
    scanned_at: row.scanned_at,
    status: row.status,
    distance_m: row.distance_m,
    latitude: row.latitude,
    longitude: row.longitude,
    kondisi: row.kondisi ?? null,
    checklist: row.checklist ?? null,
    catatan: row.catatan ?? null,
    foto_url: row.foto_url ?? null,
    post: row.post ? { id: row.post.id, name: row.post.name } : null,
    user: row.user ? { id: row.user.id, name: row.user.name } : null,
  }));

  const total = count ?? mapped.length;
  const meta = hasPagination
    ? { page, limit, total, total_pages: Math.ceil(total / limit) }
    : { total };

  res.json({ data: mapped, meta });
});

const KONDISI_VALID = ['aman', 'temuan', 'darurat'];

function validChecklist(list) {
  return (
    Array.isArray(list) &&
    list.length <= 50 &&
    list.every(
      (c) =>
        c &&
        typeof c.item === 'string' &&
        c.item.length > 0 &&
        c.item.length <= 100 &&
        typeof c.ok === 'boolean'
    )
  );
}

// PUT /api/scan-logs/:id/report — kirim/ubah laporan patroli untuk satu scan.
// Hanya pemilik scan (satpam) atau admin yang boleh.
router.put('/:id/report', async (req, res) => {
  const { kondisi, checklist, catatan, foto_url } = req.body || {};

  if (!KONDISI_VALID.includes(kondisi)) {
    return res
      .status(400)
      .json({ message: 'Kondisi wajib diisi: aman, temuan, atau darurat' });
  }
  const catatanBersih = catatan != null ? String(catatan).trim() : '';
  if (kondisi !== 'aman' && !catatanBersih) {
    return res
      .status(400)
      .json({ message: 'Catatan wajib diisi jika kondisi bukan aman' });
  }
  if (checklist !== undefined && checklist !== null && !validChecklist(checklist)) {
    return res.status(400).json({ message: 'Format checklist tidak valid' });
  }
  if (foto_url !== undefined && foto_url !== null && typeof foto_url !== 'string') {
    return res.status(400).json({ message: 'Format foto_url tidak valid' });
  }

  const { data: log } = await supabase
    .from('scan_logs')
    .select('id, user_id, status')
    .eq('id', req.params.id)
    .maybeSingle();

  if (!log) return res.status(404).json({ message: 'Data scan tidak ditemukan' });
  if (log.status !== 'ok') {
    return res
      .status(400)
      .json({ message: 'Laporan hanya bisa diisi untuk scan yang berhasil' });
  }
  if (req.user.role !== 'admin' && log.user_id !== req.user.id) {
    return res
      .status(403)
      .json({ message: 'Anda tidak berhak mengubah laporan ini' });
  }

  const updates = {
    kondisi,
    catatan: catatanBersih || null,
    checklist: checklist ?? null,
    foto_url: foto_url ?? null,
  };

  const { data, error } = await supabase
    .from('scan_logs')
    .update(updates)
    .eq('id', log.id)
    .select('id, kondisi, checklist, catatan, foto_url')
    .single();

  if (error) return res.status(500).json({ message: 'Gagal menyimpan laporan' });
  res.json({ data: { ...data, message: 'Laporan patroli tersimpan' } });
});

export default router;
