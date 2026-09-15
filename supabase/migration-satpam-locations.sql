-- Migration: tabel riwayat lokasi satpam (live tracking).
-- Snapshot posisi satpam disimpan backend tiap interval tertentu
-- (default 20 detik, lihat LOCATION_HISTORY_INTERVAL_MS di backend/.env).
create table if not exists satpam_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_satpam_locations_user_time
  on satpam_locations(user_id, recorded_at);
