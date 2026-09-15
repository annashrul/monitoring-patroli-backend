-- Migration: checklist per-post (bukan per-site)
-- Hapus tabel lama jika ada
DROP TABLE IF EXISTS checklist_items CASCADE;

-- Buat ulang dengan post_id
CREATE TABLE IF NOT EXISTS checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  item text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_post ON checklist_items(post_id);
