import { Router } from 'express';
import { supabase } from '../supabase.js';
import { haversineMeters } from '../utils/geo.js';
import { getCurrentShiftInfo } from '../services/shiftService.js';

const router = Router();

// POST /api/scan — satpam (admin juga boleh)
router.post('/', async (req, res) => {
  const { qr_token, latitude, longitude } = req.body || {};
  if (!qr_token || typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ message: 'Data scan tidak lengkap' });
  }

  const { data: post, error: postErr } = await supabase
    .from('posts')
    .select('*')
    .eq('qr_token', qr_token)
    .maybeSingle();

  if (postErr) return res.status(500).json({ message: 'Kesalahan server' });
  if (!post) return res.status(404).json({ message: 'QR code tidak dikenal' });
  if (!post.is_active) return res.status(400).json({ message: 'Pos sudah nonaktif' });

  const distance = haversineMeters(latitude, longitude, post.latitude, post.longitude);
  const distanceRounded = Math.round(distance * 10) / 10;

  // Di luar radius: tolak, tapi tetap catat percobaan untuk audit
  if (distance > post.radius_m) {
    await supabase.from('scan_logs').insert({
      post_id: post.id,
      user_id: req.user.id,
      latitude,
      longitude,
      distance_m: distanceRounded,
      status: 'out_of_radius',
    });
    return res.status(400).json({
      message: `Anda di luar radius pos (jarak ${Math.round(distance)}m, maksimal ${post.radius_m}m)`,
    });
  }

  // Cek apakah pos sudah discan pada periode shift ini
  let already = false;
  try {
    const { period } = await getCurrentShiftInfo();
    if (period) {
      const { count } = await supabase
        .from('scan_logs')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', post.id)
        .eq('status', 'ok')
        .gte('scanned_at', period.start.toISOString())
        .lt('scanned_at', period.end.toISOString());
      already = (count ?? 0) > 0;
    }
  } catch {
    // abaikan, already_scanned tetap false
  }

  const { data: log, error } = await supabase
    .from('scan_logs')
    .insert({
      post_id: post.id,
      user_id: req.user.id,
      latitude,
      longitude,
      distance_m: distanceRounded,
      status: 'ok',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ message: 'Gagal mencatat patroli' });

  // Broadcast realtime ke semua client (web admin & android)
  req.app.get('io')?.emit('post:scanned', {
    post_id: post.id,
    site_id: post.site_id,
    scanned_at: log.scanned_at,
    scanned_by: { id: req.user.id, name: req.user.name },
    already_scanned: already,
  });

  res.json({
    data: {
      scan_log_id: log.id,
      post_id: post.id,
      post_name: post.name,
      scanned_at: log.scanned_at,
      distance_m: distanceRounded,
      already_scanned: already,
      message: 'Patroli berhasil dicatat',
    },
  });
});

export default router;
