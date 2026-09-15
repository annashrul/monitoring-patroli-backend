-- Migration: simpan lokasi terakhir satpam
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_latitude double precision;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_longitude double precision;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_location_at timestamptz;
