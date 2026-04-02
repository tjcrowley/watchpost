-- 001_initial.sql — Core tables for WatchPost
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE sites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  protect_url TEXT NOT NULL DEFAULT '',
  protect_key TEXT NOT NULL DEFAULT '',
  timezone    TEXT DEFAULT 'UTC',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID REFERENCES sites(id),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','operator','viewer')),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE cameras (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID REFERENCES sites(id),
  protect_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  enabled     BOOLEAN DEFAULT true,
  zone_config JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE subjects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      UUID REFERENCES sites(id),
  display_name TEXT NOT NULL,
  list_type    TEXT NOT NULL CHECK (list_type IN ('ban','watch','vip')),
  reason       TEXT,
  added_by     UUID REFERENCES users(id),
  expires_at   TIMESTAMPTZ,
  active       BOOLEAN DEFAULT true,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
