-- Tabel findings: laporan temuan satpam saat patroli
CREATE TABLE IF NOT EXISTS findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  site_id uuid REFERENCES sites(id),
  latitude double precision,
  longitude double precision,
  category text NOT NULL DEFAULT 'general',
  description text NOT NULL,
  photo_url text,
  whatsapp_sent boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_findings_site ON findings(site_id);
CREATE INDEX IF NOT EXISTS idx_findings_user ON findings(user_id);
CREATE INDEX IF NOT EXISTS idx_findings_created ON findings(created_at DESC);
