-- Migration: interval per post + status tanpa shift
-- 3 status: green (scanned), yellow (harus scan ulang), red (belum/jatuh tempo)

-- Tambah interval_minutes ke posts (default 120 menit = 2 jam)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS interval_minutes integer NOT NULL DEFAULT 120;
