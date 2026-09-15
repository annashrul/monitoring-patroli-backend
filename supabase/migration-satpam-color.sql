-- Migration: tambah color untuk satpam (warna marker di peta admin)
ALTER TABLE users ADD COLUMN IF NOT EXISTS color text DEFAULT '#3B82F6';
