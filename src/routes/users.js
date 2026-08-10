import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../supabase.js';
import { requireRole, getScopeFilter } from '../middleware/auth.js';
import { emitToUser } from '../socket.js';

const router = Router();

// Semua endpoint users untuk admin & owner
router.use(requireRole('admin', 'owner'));

const ROLES = ['owner', 'admin', 'satpam'];
const SAFE_SELECT = 'id, username, name, role, site_id, device_token, color, is_active, created_at';

// GET /api/users — owner lihat semua, admin lihat user di site-nya saja
router.get('/', async (req, res) => {
  let query = supabase.from('users').select(SAFE_SELECT).order('created_at');
  const scope = await getScopeFilter(req);
  if (scope) {
    query = query.or(`site_id.eq.${scope},role.eq.owner`);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ message: 'Gagal mengambil data user' });
  res.json({ data });
});

// POST /api/users
router.post('/', async (req, res) => {
  const { username, password, name, role, site_id, color } = req.body || {};
  if (!username || !password || !name || !ROLES.includes(role)) {
    return res
      .status(400)
      .json({ message: 'Username, password, nama, dan role (owner/admin/satpam) wajib diisi' });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const insertData = { username, password_hash, name, role };
  if (site_id) insertData.site_id = site_id;
  else if (role !== 'owner') insertData.site_id = null;
  if (color) insertData.color = color;

  const { data, error } = await supabase
    .from('users')
    .insert(insertData)
    .select(SAFE_SELECT)
    .single();

  if (error) {
    if (error.code === '23505') return res.status(400).json({ message: 'Username sudah digunakan' });
    return res.status(500).json({ message: 'Gagal membuat user' });
  }
  res.status(201).json({ data });
});

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  const { name, role, site_id, color, is_active, password } = req.body || {};
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (role !== undefined) {
    if (!ROLES.includes(role)) return res.status(400).json({ message: 'Role tidak valid' });
    updates.role = role;
  }
  if (site_id !== undefined) updates.site_id = site_id || null;
  if (color !== undefined) updates.color = color || '#3B82F6';
  if (is_active !== undefined) updates.is_active = !!is_active;
  if (password) updates.password_hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', req.params.id)
    .select(SAFE_SELECT)
    .maybeSingle();

  if (error) return res.status(500).json({ message: 'Gagal mengubah user' });
  if (!data) return res.status(404).json({ message: 'User tidak ditemukan' });
  // Emit ke satpam jika color/site_id berubah
  if (color !== undefined || site_id !== undefined) {
    emitToUser(req.params.id, 'user:updated', { color: data.color, site_id: data.site_id });
  }
  res.json({ data });
});

// POST /api/users/:id/release — lepas device binding & kirim notif realtime
router.post('/:id/release', async (req, res) => {
  const { error } = await supabase
    .from('users')
    .update({ device_token: null })
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ message: 'Gagal melepas sesi' });
  emitToUser(req.params.id, 'session:released', {});
  res.json({ data: { id: req.params.id } });
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ message: 'Tidak dapat menghapus akun sendiri' });
  }
  const { error } = await supabase.from('users').delete().eq('id', req.params.id);
  if (error) {
    if (error.code === '23503') {
      return res
        .status(400)
        .json({ message: 'User memiliki riwayat patroli, nonaktifkan saja daripada menghapus' });
    }
    return res.status(500).json({ message: 'Gagal menghapus user' });
  }
  res.json({ data: { id: req.params.id } });
});

export default router;
