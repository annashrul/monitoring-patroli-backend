import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/checklist-items?post_id= — public
router.get('/', async (req, res) => {
  const postId = req.query.post_id;
  if (!postId) return res.status(400).json({ message: 'post_id diperlukan' });
  const { data, error } = await supabase.from('checklist_items').select('*').eq('post_id', postId).eq('is_active', true).order('created_at');
  if (error) return res.status(500).json({ message: 'Gagal memuat checklist' });
  res.json({ data });
});

// POST /api/checklist-items — admin & owner
router.post('/', requireRole('admin', 'owner'), async (req, res) => {
  const { post_id, item } = req.body || {};
  if (!post_id || !item || !item.trim()) return res.status(400).json({ message: 'post_id dan item wajib diisi' });
  const { data, error } = await supabase.from('checklist_items').insert({ post_id, item: item.trim() }).select().single();
  if (error) return res.status(500).json({ message: 'Gagal membuat item' });
  res.status(201).json({ data });
});

// PUT /api/checklist-items/:id — admin & owner
router.put('/:id', requireRole('admin', 'owner'), async (req, res) => {
  const { item, is_active } = req.body || {};
  const updates = {};
  if (item !== undefined) updates.item = item.trim();
  if (is_active !== undefined) updates.is_active = !!is_active;
  const { data, error } = await supabase.from('checklist_items').update(updates).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(500).json({ message: 'Gagal mengubah item' });
  if (!data) return res.status(404).json({ message: 'Item tidak ditemukan' });
  res.json({ data });
});

// DELETE /api/checklist-items/:id — admin & owner
router.delete('/:id', requireRole('admin', 'owner'), async (req, res) => {
  const { error } = await supabase.from('checklist_items').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ message: 'Gagal menghapus item' });
  res.json({ data: { id: req.params.id } });
});

export default router;
