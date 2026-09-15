-- =============================================================
-- Migrasi: Tabel app_config untuk konfigurasi remote (mobile)
-- Jalankan di Supabase SQL Editor
-- =============================================================

-- Tabel key-value untuk konfigurasi aplikasi
create table if not exists app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Insert default: API base URL (ganti value sesuai deployment)
insert into app_config (key, value)
values ('api_base_url', 'https://monitoring-patroli-backend.onrender.com')
on conflict (key) do nothing;

-- RLS: izinkan SELECT untuk semua (termasuk anon) agar mobile bisa baca
alter table app_config enable row level security;

create policy "Allow public read app_config"
  on app_config for select
  using (true);