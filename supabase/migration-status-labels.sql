-- Migration: default status labels + colors di app_config
INSERT INTO app_config (key, value) VALUES
  ('label_green', 'Aman'),
  ('label_yellow', 'Scan Ulang'),
  ('label_red', 'Belum'),
  ('color_green', '#16a34a'),
  ('color_yellow', '#f59e0b'),
  ('color_red', '#dc2626')
ON CONFLICT (key) DO NOTHING;
