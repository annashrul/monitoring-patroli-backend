-- =============================================================
-- Patroli Satpam - Database Schema (Supabase / PostgreSQL)
-- Jalankan file ini di Supabase SQL Editor (Dashboard > SQL Editor)
-- =============================================================

-- Tabel users: admin (web), owner (web), & satpam (android)
-- site_id nullable — satpam dengan site_id hanya bisa scan pos di site tersebut
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  name text not null,
  role text not null check (role in ('owner','admin','satpam')),
  site_id uuid references sites(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Tabel sites: area patroli dengan batas polygon (misal: Pabrik Kahatex)
-- polygon disimpan sebagai JSONB array of object: [{"lat": -6.9, "lng": 107.6}, ...]
create table if not exists sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  polygon jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Tabel posts: titik pos patroli yang memiliki QR code & radius scan
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_m integer not null default 20,
  qr_token text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Tabel shifts: definisi shift patroli.
-- site_id nullable — null berarti berlaku untuk semua site.
create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time time not null,
  end_time time not null,
  site_id uuid references sites(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Tabel scan_logs: riwayat scan QR oleh satpam
-- status 'ok' = scan valid di dalam radius, 'out_of_radius' = percobaan di luar radius
-- kondisi/checklist/catatan/foto_url = laporan patroli (NULL jika belum diisi)
create table if not exists scan_logs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references users(id),
  scanned_at timestamptz not null default now(),
  latitude double precision not null,
  longitude double precision not null,
  distance_m double precision not null,
  status text not null check (status in ('ok','out_of_radius')),
  kondisi text check (kondisi in ('aman','temuan','darurat')),
  checklist jsonb,
  catatan text,
  foto_url text
);

-- Index
create index if not exists idx_posts_site on posts(site_id);
create index if not exists idx_posts_qr_token on posts(qr_token);
create index if not exists idx_scan_logs_post_time on scan_logs(post_id, scanned_at desc);
create index if not exists idx_scan_logs_user on scan_logs(user_id);
create index if not exists idx_scan_logs_scanned_at on scan_logs(scanned_at desc);
create index if not exists idx_users_site on users(site_id);
create index if not exists idx_shifts_site on shifts(site_id);

-- Default shifts (boleh diubah/dihapus lewat web admin)
insert into shifts (name, start_time, end_time)
select * from (values
  ('Shift Pagi', '06:00'::time, '14:00'::time),
  ('Shift Siang', '14:00'::time, '22:00'::time),
  ('Shift Malam', '22:00'::time, '06:00'::time)
) as v(name, start_time, end_time)
where not exists (select 1 from shifts);

-- Catatan:
-- Backend menggunakan SERVICE ROLE key sehingga RLS tidak perlu dikonfigurasi.
-- Password user dibuat lewat script seed backend (bcrypt), bukan di SQL ini.
