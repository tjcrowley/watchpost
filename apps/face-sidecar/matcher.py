"""Face matching against enrolled embeddings in pgvector."""

import os
import uuid

import psycopg2

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://watchpost:watchpost@postgres:5432/watchpost",
)


def _get_conn() -> psycopg2.extensions.connection:
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    return conn


def find_match(
    embedding: list[float],
    site_id: str,
    threshold: float = 0.4,
) -> dict | None:
    """Find the closest enrolled face within the distance threshold."""
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT fe.id, fe.subject_id, s.display_name, s.list_type,
                       (fe.embedding <=> %s::vector) as distance
                FROM face_enrollments fe
                JOIN subjects s ON s.id = fe.subject_id
                WHERE s.site_id = %s AND s.active = true
                ORDER BY distance
                LIMIT 1
                """,
                (str(embedding), site_id),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if row is None or row[4] > threshold:
        return None

    return {
        "subject_id": row[1],
        "display_name": row[2],
        "list_type": row[3],
        "distance": float(row[4]),
        "confidence": 1.0 - float(row[4]),
    }


def store_embedding(
    subject_id: str,
    embedding: list[float],
    source_path: str = None,
    quality: float = None,
) -> str:
    """Insert a new face enrollment and return its id."""
    enrollment_id = str(uuid.uuid4())
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO face_enrollments (id, subject_id, embedding, source_path, quality)
                VALUES (%s, %s, %s::vector, %s, %s)
                RETURNING id
                """,
                (enrollment_id, subject_id, str(embedding), source_path, quality),
            )
            result = cur.fetchone()
            return result[0]
    finally:
        conn.close()
