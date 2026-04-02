"""Face detection and embedding extraction using InsightFace buffalo_sc model."""

import io
from dataclasses import dataclass

import cv2
import numpy as np
from insightface.app import FaceAnalysis
from PIL import Image


@dataclass
class DetectedFace:
    bbox: tuple[float, float, float, float]
    confidence: float
    embedding: list[float]
    quality: float


class FaceDetector:
    """Wraps InsightFace for face detection and 512-d embedding extraction."""

    def __init__(self, model_name: str = "buffalo_sc", ctx_id: int = 0) -> None:
        self._app = FaceAnalysis(
            name=model_name,
            allowed_modules=["detection", "recognition"],
        )
        self._app.prepare(ctx_id=ctx_id, det_size=(640, 640))

    def detect(self, image_bytes: bytes) -> list[DetectedFace]:
        """Detect faces in a JPEG/PNG image and return embeddings."""
        image = Image.open(io.BytesIO(image_bytes))
        frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

        faces = self._app.get(frame)

        results: list[DetectedFace] = []
        for face in faces:
            bbox = face.bbox.tolist()
            confidence = float(face.det_score)
            embedding = face.normed_embedding.tolist()

            # Quality heuristic: face area relative to image + detection score
            face_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
            image_area = frame.shape[0] * frame.shape[1]
            area_ratio = face_area / image_area if image_area > 0 else 0
            quality = min(1.0, confidence * 0.6 + area_ratio * 4.0)

            results.append(
                DetectedFace(
                    bbox=(bbox[0], bbox[1], bbox[2], bbox[3]),
                    confidence=confidence,
                    embedding=embedding,
                    quality=quality,
                )
            )

        return results
