-- 002_pgvector.sql — Face embeddings and detection events
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE face_enrollments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id   UUID REFERENCES subjects(id) ON DELETE CASCADE,
  embedding    vector(512) NOT NULL,
  source_path  TEXT,
  quality      FLOAT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON face_enrollments USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE detection_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id           UUID REFERENCES sites(id),
  camera_id         UUID REFERENCES cameras(id),
  protect_event_id  TEXT,
  event_type        TEXT NOT NULL,
  detected_at       TIMESTAMPTZ NOT NULL,
  snapshot_path     TEXT,
  best_face_crop    TEXT,
  embedding         vector(512),
  match_subject_id  UUID REFERENCES subjects(id),
  match_distance    FLOAT,
  match_confidence  FLOAT,
  review_status     TEXT DEFAULT 'pending' CHECK (review_status IN ('pending','confirmed','dismissed')),
  reviewed_by       UUID REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE alerts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_event_id  UUID REFERENCES detection_events(id),
  channel             TEXT NOT NULL,
  destination         TEXT NOT NULL,
  payload             JSONB,
  sent_at             TIMESTAMPTZ,
  status              TEXT DEFAULT 'queued',
  error               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);
