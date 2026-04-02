-- 004_seed.sql — Default site and admin user for first boot
-- Safe to re-run (ON CONFLICT DO NOTHING)

-- Default site (worker will update protect_url/protect_key via env or UI)
INSERT INTO sites (id, name, protect_url, protect_key)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default', '', '')
ON CONFLICT DO NOTHING;

-- Default admin user: admin@watchpost.local / watchpost
-- bcrypt hash of "watchpost" with cost 10
INSERT INTO users (site_id, email, password_hash, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@watchpost.local',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'admin'
)
ON CONFLICT (email) DO NOTHING;

-- alert_destinations table (referenced in processor.ts but not in original migrations)
CREATE TABLE IF NOT EXISTS alert_destinations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID REFERENCES sites(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'webhook')),
  destination TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- cameras unique constraint (needed for worker upsert)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cameras_site_id_protect_id_key'
  ) THEN
    ALTER TABLE cameras ADD CONSTRAINT cameras_site_id_protect_id_key UNIQUE (site_id, protect_id);
  END IF;
END $$;
