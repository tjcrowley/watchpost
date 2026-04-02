"""Face detection and embedding extraction using InsightFace buffalo_sc model."""

import io

import numpy as np
from insightface.app import FaceAnalysis
from PIL import Image

app = FaceAnalysis(name="buffalo_sc", providers=["CPUExecutionProvider"])
app.prepare(ctx_id=0, det_size=(640, 640))


def detect_faces(image_bytes: bytes) -> list[dict]:
    """Detect faces in a JPEG/PNG image and return bounding boxes, quality, embeddings, and det_score."""
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = np.array(image)

    faces = app.get(img)

    results: list[dict] = []
    for face in faces:
        det_score = float(face.det_score)
        if det_score < 0.3:
            continue

        bbox = face.bbox.tolist()
        embedding = face.normed_embedding.tolist()

        face_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        image_area = img.shape[0] * img.shape[1]
        area_ratio = face_area / image_area if image_area > 0 else 0
        quality = min(1.0, det_score * 0.6 + area_ratio * 4.0)

        results.append({
            "bbox": [bbox[0], bbox[1], bbox[2], bbox[3]],
            "quality": quality,
            "embedding": embedding,
            "det_score": det_score,
        })

    return results


def crop_face(image_bytes: bytes, bbox: list) -> bytes:
    """Crop a face region from the image and return JPEG bytes."""
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])

    x1 = max(0, x1)
    y1 = max(0, y1)
    x2 = min(image.width, x2)
    y2 = min(image.height, y2)

    cropped = image.crop((x1, y1, x2, y2))

    buf = io.BytesIO()
    cropped.save(buf, format="JPEG", quality=90)
    return buf.getvalue()
