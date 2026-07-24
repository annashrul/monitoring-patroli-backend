import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import config from './config.js';

if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
  console.warn('PERINGATAN: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diisi di .env');
}

// Catatan: aplikasi ini memakai Socket.IO sendiri, bukan Supabase Realtime.
// Transport 'ws' diisi hanya agar client supabase-js bisa dibuat di Node.js 20
// (realtime-js membutuhkan konstruktor WebSocket).
export const supabase = createClient(
  config.supabaseUrl || 'https://placeholder.supabase.co',
  config.supabaseServiceRoleKey || 'placeholder-key',
  {
    auth: { persistSession: false },
    realtime: { transport: ws },
  }
);

// Bucket Supabase Storage untuk foto bukti laporan patroli
export const BUCKET = 'patroli-foto';

/** Pastikan bucket storage ada (dipanggil sekali saat server start). */
export async function ensureBucket() {
  try {
    const { data } = await supabase.storage.getBucket(BUCKET);
    if (data) return;
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true, // URL publik agar foto bisa dilihat di web admin
    });
    if (error && !/already exists/i.test(error.message || '')) {
      console.warn(`Gagal membuat bucket '${BUCKET}':`, error.message);
    } else {
      console.log(`Bucket storage '${BUCKET}' siap.`);
    }
  } catch (e) {
    console.warn(`Gagal memastikan bucket '${BUCKET}':`, e.message);
  }
}
