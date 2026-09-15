-- =============================================================
-- Migration: Laporan patroli pada scan_logs
-- Jalankan SEKALI di Supabase SQL Editor untuk database yang sudah ada.
-- (File schema.sql juga sudah diperbarui untuk instalasi baru.)
-- =============================================================

-- kondisi: NULL = laporan belum diisi; 'aman' | 'temuan' | 'darurat'
alter table scan_logs
  add column if not exists kondisi text check (kondisi in ('aman','temuan','darurat'));

-- checklist: JSONB array [{ "item": "Penerangan normal", "ok": true }, ...]
alter table scan_logs
  add column if not exists checklist jsonb;

-- catatan: wajib diisi (di level aplikasi) jika kondisi != 'aman'
alter table scan_logs
  add column if not exists catatan text;

-- foto_url: URL foto bukti di Supabase Storage (bucket 'patroli-foto')
alter table scan_logs
  add column if not exists foto_url text;

-- paksa PostgREST memuat ulang cache skema
notify pgrst, 'reload schema';
