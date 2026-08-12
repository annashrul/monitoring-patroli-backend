import { supabase } from '../supabase.js';

/**
 * Ambil semua posts suatu site beserta status patroli (tanpa shift, interval-based):
 *
 * - green   : scan terakhir dalam interval (interval_minutes)
 * - yellow  : scan terakhir antara interval s/d 2×interval (grace period)
 * - red     : belum pernah discan, atau melebihi 2×interval
 */
export async function getPostsWithStatus(siteId) {
  const { data: posts, error } = await supabase
    .from('posts')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at');

  if (error) throw error;
  if (!posts?.length) return [];

  const now = new Date();
  const lastScanMap = new Map();

  // Ambil scan terakhir untuk setiap post (tanpa filter periode — semua waktu)
  const { data: logs } = await supabase
    .from('scan_logs')
    .select('post_id, scanned_at, users(name)')
    .in('post_id', posts.map((p) => p.id))
    .eq('status', 'ok')
    .order('scanned_at', { ascending: false });

  for (const log of logs || []) {
    if (!lastScanMap.has(log.post_id)) {
      lastScanMap.set(log.post_id, {
        scanned_at: log.scanned_at,
        scanned_by_name: log.users?.name ?? '-',
      });
    }
  }

  return posts.map((p) => {
    const lastScan = lastScanMap.get(p.id) ?? null;
    const interval = (p.interval_minutes || 120) * 60 * 1000; // ms
    let status = 'red';

    if (lastScan) {
      const elapsed = now - new Date(lastScan.scanned_at);
      if (elapsed < interval) {
        status = 'green';
      } else if (elapsed < interval * 2) {
        status = 'yellow';
      } else {
        status = 'red';
      }
    }

    return {
      id: p.id,
      site_id: p.site_id,
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      radius_m: p.radius_m,
      qr_token: p.qr_token,
      interval_minutes: p.interval_minutes,
      is_active: p.is_active,
      status,
      last_scan: lastScan,
    };
  });
}
