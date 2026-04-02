"""Face matching against enrolled embeddings in pgvector."""

import os
from dataclasses import dataclass

import psycopg2
from pgvector.psycopg2 import register_vector


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://watchpost:watchpost@postgres:5432/watchpost",
)
MATCH_THRESHOLD = float(os.environ.get("MATCH_THRESHOLD", "0.4"))


@dataclass
class MatchResult:
    subject_id: str
    display_name: str
    list_type: str
    distance: float
    confidence: float


class FaceMatcher:
    """Queries pgvector for nearest-neighbor face matches."""

    def __init__(self) -> None:
        self._conn: psycopg2.extensions.connection | None = None

    def _get_conn(self) -> psycopg2.extensions.connection:
        if self._conn is None or self._conn.closed:
            self._conn = psycopg2.connect(DATABASE_URL)
            register_vector(self._conn)
        return self._conn

    def find_match(
        self,
        embedding: list[float],
        site_id: str,
        threshold: float | None = None,
    ) -> MatchResult | None:
        """Find the closest enrolled face within the distance threshold."""
        threshold = threshold or MATCH_THRESHOLD
        conn = self._get_conn()

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT fe.subject_id, s.display_name, s.list_type,
                       fe.embedding <=> %s::vector AS distance
                FROM face_enrollments fe
                JOIN subjects s ON fe.subject_id = s.id
                WHERE s.site_id = %s AND s.active = true
                ORDER BY fe.embedding <=> %s::vector
                LIMIT 1
                """,
                (embedding, site_id, embedding),
            )
            row = cur.fetchone()

        if row is None or row[3] > threshold:
            return None

        return MatchResult(
            subject_id=row[0],
            display_name=row[1],
            list_type=row[2],
            distance=row[3],
            confidence=1 - row[3],
        )

    def close(self) -> None:
        if self._conn and not self._conn.closed:
            self._conn.close()
