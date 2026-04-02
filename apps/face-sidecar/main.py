"""WatchPost Face Sidecar — FastAPI service for face detection and matching."""

import base64
import logging
import os

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import detector
import matcher

logging.basicConfig(
    level=getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper()),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("face-sidecar")

app = FastAPI(title="WatchPost Face Sidecar", version="1.0.0")


class DetectRequest(BaseModel):
    image_b64: str
    site_id: str
    threshold: float = 0.4


class EnrollRequest(BaseModel):
    image_b64: str
    subject_id: str


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "model": "buffalo_sc"}


@app.post("/detect")
async def detect(req: DetectRequest):
    try:
        image_bytes = base64.b64decode(req.image_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image")

    try:
        faces = detector.detect_faces(image_bytes)
    except Exception as e:
        logger.error("Detection failed: %s", e)
        raise HTTPException(status_code=422, detail=f"Detection failed: {e}")

    results = []
    for face in faces:
        match = matcher.find_match(face["embedding"], req.site_id, req.threshold)
        face_crop_bytes = detector.crop_face(image_bytes, face["bbox"])
        face_crop_b64 = base64.b64encode(face_crop_bytes).decode("utf-8")

        results.append({
            "bbox": face["bbox"],
            "quality": face["quality"],
            "det_score": face["det_score"],
            "embedding": face["embedding"],
            "match": match,
            "face_crop_b64": face_crop_b64,
        })

    return results


@app.post("/enroll")
async def enroll(req: EnrollRequest):
    try:
        image_bytes = base64.b64decode(req.image_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image")

    try:
        faces = detector.detect_faces(image_bytes)
    except Exception as e:
        logger.error("Enrollment detection failed: %s", e)
        raise HTTPException(status_code=422, detail=f"Detection failed: {e}")

    if not faces:
        raise HTTPException(status_code=422, detail="No face detected in image")

    best = max(faces, key=lambda f: f["quality"])

    enrollment_id = matcher.store_embedding(
        subject_id=req.subject_id,
        embedding=best["embedding"],
        quality=best["quality"],
    )

    return {
        "enrollment_id": enrollment_id,
        "quality": best["quality"],
        "embedding": best["embedding"],
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5500)
