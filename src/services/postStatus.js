import { supabase } from '../supabase.js';
import { getCurrentShiftInfo } from './shiftService.js';

/**
 * Ambil semua posts suatu site beserta status patroli periode shift berjalan:
 * status 'scanned' jika ada scan_logs status 'ok' dalam periode shift aktif,
 * selain itu 'pending'. Termasuk last_scan { scanned_at, scanned_by_name }.
 */
export async function getPostsWithStatus(siteId) {
  const { data: posts, error } = await supabase
    .from('posts')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at');

  if (error) throw error;
  if (!posts?.length) return [];

  let period = null;
  try {
    ({ period } = await getCurrentShiftInfo());
  } catch {
    period = null;
  }

  const lastByPost = new Map();
  if (period) {
    const { data: logs } = await supabase
      .from('scan_logs')
      .select('post_id, scanned_at, users(name)')
      .in('post_id', posts.map((p) => p.id))
      .eq('status', 'ok')
      .gte('scanned_at', period.start.toISOString())
      .lt('scanned_at', period.end.toISOString())
      .order('scanned_at', { ascending: false });

    // logs sudah urut terbaru -> yang pertama per post adalah scan terakhir
    for (const log of logs || []) {
      if (!lastByPost.has(log.post_id)) {
        lastByPost.set(log.post_id, {
          scanned_at: log.scanned_at,
          scanned_by_name: log.users?.name ?? '-',
        });
      }
    }
  }

  return posts.map((p) => ({
    ...p,
    status: lastByPost.has(p.id) ? 'scanned' : 'pending',
    last_scan: lastByPost.get(p.id) ?? null,
  }));
}
