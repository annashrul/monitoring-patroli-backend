-- Migration: simpan akurasi GPS & timestamp saat titik pos dibuat (validasi penempatan pos).
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS accuracy double precision;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS gps_timestamp timestamptz;
