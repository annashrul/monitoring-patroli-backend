import { supabase } from '../supabase.js';

/**
 * Ambil posts beserta status patroli (tanpa shift, interval-based):
 *
 * - green   : scan terakhir dalam interval (interval_minutes)
 * - yellow  : scan terakhir antara interval s/d 2×interval (grace period)
 * - red     : belum pernah discan, atau melebihi 2×interval
 *
 * Opsi:
 * - siteId       : null/undefined berarti semua site
 * - search       : filter nama pos (case-insensitive)
 * - page, limit  : pagination (bila keduanya integer valid)
 * - includeQrToken : sertakan qr_token pada hasil (default true)
 *
 * Return: { data, total }
 */
export async function getPostsWithStatus(siteId, opts = {}) {
  const { search, page, limit, includeQrToken = true } = opts;

  let query = supabase.from('posts').select('*', { count: 'exact' });
  if (siteId) query = query.eq('site_id', siteId);
  if (search) {
    query = query.ilike('name', `%${search}%`);
  }
  query = query.order('created_at');

  if (Number.isInteger(page) && Number.isInteger(limit) && page > 0 && limit > 0) {
    query = query.range((page - 1) * limit, page * limit - 1);
  }

  const { data: posts, error, count } = await query;

  if (error) throw error;

  const total = count ?? (posts?.length ?? 0);
  if (!posts?.length) return { data: [], total };

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

  const data = posts.map((p) => {
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

    const item = {
      id: p.id,
      site_id: p.site_id,
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      radius_m: p.radius_m,
      interval_minutes: p.interval_minutes,
      is_active: p.is_active,
      status,
      last_scan: lastScan,
    };

    if (includeQrToken) item.qr_token = p.qr_token;

    return item;
  });

  return { data, total };
}
