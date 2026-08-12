import { Router } from 'express';
import { supabase } from '../supabase.js';
import { uploadSingleFoto, saveFotoToStorage } from './upload.js';

const router = Router();

const CATEGORIES = ['general', 'security', 'cleanliness', 'damage', 'other'];

// GET /api/findings?site_id=
router.get('/', async (req, res) => {
  let q = supabase.from('findings').select('*, user:users(id,name)').order('created_at', { ascending: false }).limit(200);
  if (req.query.site_id) q = q.eq('site_id', req.query.site_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ message: 'Gagal memuat data findings' });
  res.json({ data });
});

// POST /api/findings
router.post('/', async (req, res) => {
  const { site_id, latitude, longitude, category, description } = req.body || {};
  if (!description || !description.trim()) {
    return res.status(400).json({ message: 'Deskripsi wajib diisi' });
  }

  const cat = CATEGORIES.includes(category) ? category : 'general';

  const { data, error } = await supabase.from('findings').insert({
    user_id: req.user.id,
    site_id: site_id || null,
    latitude: latitude || null,
    longitude: longitude || null,
    category: cat,
    description: description.trim(),
  }).select().single();

  if (error) return res.status(500).json({ message: 'Gagal menyimpan findings' });
  res.status(201).json({ data });
});

// POST /api/findings/:id/photo — upload foto
router.post('/:id/photo', uploadSingleFoto, async (req, res) => {
  const { data: existing } = await supabase.from('findings').select('id').eq('id', req.params.id).maybeSingle();
  if (!existing) return res.status(404).json({ message: 'Finding tidak ditemukan' });

  try {
    const url = await saveFotoToStorage(req.file);
    const { error } = await supabase.from('findings').update({ photo_url: url }).eq('id', req.params.id);
    if (error) return res.status(500).json({ message: 'Gagal upload foto' });
    res.json({ data: { photo_url: url } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/findings/:id/whatsapp — generate WhatsApp share link
router.get('/:id/whatsapp', async (req, res) => {
  const { data } = await supabase.from('findings').select('*, user:users(name)').eq('id', req.params.id).maybeSingle();
  if (!data) return res.status(404).json({ message: 'Finding tidak ditemukan' });

  const text = `🚨 *FINDINGS REPORT*\n\n📋 *Category:* ${data.category}\n👤 *Reporter:* ${data.user?.name || '-'}\n📍 *Location:* ${data.latitude ? `https://maps.google.com/?q=${data.latitude},${data.longitude}` : '-'}\n📝 *Description:* ${data.description}${data.photo_url ? `\n📷 *Photo:* ${data.photo_url}` : ''}\n🕐 *Time:* ${new Date(data.created_at).toLocaleString('id-ID')}`;

  const encoded = encodeURIComponent(text);
  const waUrl = `https://wa.me/?text=${encoded}`;

  await supabase.from('findings').update({ whatsapp_sent: true }).eq('id', req.params.id);
  res.json({ data: { whatsapp_url: waUrl } });
});

export default router;
