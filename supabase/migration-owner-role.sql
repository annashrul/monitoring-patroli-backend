-- Migration: tambah role owner + site_id ke users dan shifts
-- Jalankan di Supabase SQL Editor jika tabel sudah ada sebelumnya

-- 1. Update role constraint di users (tambah 'owner')
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','admin','satpam'));

-- 2. Tambah site_id ke users
ALTER TABLE users ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE SET NULL;

-- 3. Tambah site_id ke shifts
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE SET NULL;

-- 4. Index
CREATE INDEX IF NOT EXISTS idx_users_site ON users(site_id);
CREATE INDEX IF NOT EXISTS idx_shifts_site ON shifts(site_id);
