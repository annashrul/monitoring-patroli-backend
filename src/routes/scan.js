import { Router } from 'express';
import { supabase } from '../supabase.js';
import { haversineMeters } from '../utils/geo.js';
import { getCurrentShiftInfo } from '../services/shiftService.js';

const router = Router();

// POST /api/scan — satpam (admin juga boleh)
router.post('/', async (req, res) => {
  const { qr_token, latitude, longitude } = req.body || {};
  console.log('[DEBUG] /api/scan request:', { qr_token, latitude, longitude, types: { latitude: typeof latitude, longitude: typeof longitude } });

  // Coerce to numbers and validate
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!qr_token || isNaN(lat) || isNaN(lng)) {
    console.log('[DEBUG] Invalid data scan');
    return res.status(400).json({ message: 'Data scan tidak lengkap atau tidak valid' });
  }

  const { data: post, error: postErr } = await supabase
    .from('posts')
    .select('*')
    .eq('qr_token', qr_token)
    .maybeSingle();

  console.log('[DEBUG] Post data:', post, 'Error:', postErr);

  if (postErr) return res.status(500).json({ message: 'Kesalahan server' });
  if (!post) return res.status(404).json({ message: 'QR code tidak dikenal' });
  if (!post.is_active) return res.status(400).json({ message: 'Pos sudah nonaktif' });

  const radiusM = Number(post.radius_m);
  const distance = haversineMeters(lat, lng, Number(post.latitude), Number(post.longitude));
  const distanceRounded = Math.round(distance * 10) / 10;

  console.log('[DEBUG] Distance calculation (coerced):', {
    user: { latitude: lat, longitude: lng },
    post: { latitude: Number(post.latitude), longitude: Number(post.longitude) },
    distance,
    radius_m: radiusM,
    is_outside: distance > radiusM,
  });

  // Di luar radius: tolak, tapi tetap catat percobaan untuk audit
  if (distance > radiusM) {
    console.log('[DEBUG] Scan rejected: out of radius');
    await supabase.from('scan_logs').insert({
      post_id: post.id,
      user_id: req.user.id,
      latitude: lat,
      longitude: lng,
      distance_m: distanceRounded,
      status: 'out_of_radius',
    });
    return res.status(400).json({
      message: `Anda di luar radius pos (jarak ${Math.round(distance)}m, maksimal ${radiusM}m)`,
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
      latitude: lat,
      longitude: lng,
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
