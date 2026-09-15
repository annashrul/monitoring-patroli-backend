-- Migration: device binding untuk satpam (1 device per akun)
-- Jalankan di Supabase SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS device_token text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_device_token ON users(device_token);
