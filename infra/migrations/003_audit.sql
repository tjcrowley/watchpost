-- 003_audit.sql — Audit logging
CREATE TABLE audit_log (
  id         BIGSERIAL PRIMARY KEY,
  site_id    UUID REFERENCES sites(id),
  user_id    UUID REFERENCES users(id),
  action     TEXT NOT NULL,
  target     TEXT,
  meta       JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
