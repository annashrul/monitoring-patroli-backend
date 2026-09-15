-- Migration: setting lokasi per-site (interval & jarak minimum untuk riwayat pergerakan).
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS location_history_interval_ms integer NOT NULL DEFAULT 20000;

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS location_min_distance_m double precision NOT NULL DEFAULT 10;
