"""WatchPost Face Sidecar — FastAPI service for face detection and matching."""

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from detector import FaceDetector
from matcher import FaceMatcher

logging.basicConfig(
    level=getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper()),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("face-sidecar")

detector: FaceDetector | None = None
matcher: FaceMatcher | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    global detector, matcher
    logger.info("Loading InsightFace model (buffalo_sc)...")
    detector = FaceDetector(model_name="buffalo_sc")
    matcher = FaceMatcher()
    logger.info("Face sidecar ready")
    yield
    if matcher:
        matcher.close()
    logger.info("Face sidecar shutting down")


app = FastAPI(
    title="WatchPost Face Sidecar",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "watchpost-face-sidecar"}


@app.post("/detect")
async def detect(request: Request) -> JSONResponse:
    """Detect faces in an image and return bounding boxes + embeddings."""
    if detector is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty request body")

    try:
        faces = detector.detect(body)
    except Exception as e:
        logger.error("Detection failed: %s", e)
        raise HTTPException(status_code=422, detail=f"Detection failed: {e}")

    return JSONResponse(
        content={
            "faces": [
                {
                    "bbox": list(f.bbox),
                    "confidence": f.confidence,
                    "embedding": f.embedding,
                    "quality": f.quality,
                }
                for f in faces
            ]
        }
    )


@app.post("/enroll")
async def enroll(request: Request) -> JSONResponse:
    """Detect a face and return the embedding for enrollment.

    This is a convenience endpoint — the API service stores the embedding
    in pgvector. The sidecar just extracts it.
    """
    if detector is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty request body")

    try:
        faces = detector.detect(body)
    except Exception as e:
        logger.error("Enrollment detection failed: %s", e)
        raise HTTPException(status_code=422, detail=f"Detection failed: {e}")

    if not faces:
        raise HTTPException(status_code=422, detail="No face detected in image")

    # Return the best quality face
    best = max(faces, key=lambda f: f.quality)

    return JSONResponse(
        content={
            "embedding": best.embedding,
            "quality": best.quality,
            "bbox": list(best.bbox),
            "confidence": best.confidence,
        }
    )


@app.post("/match")
async def match(request: Request) -> JSONResponse:
    """Match an embedding against enrolled faces.

    Expects JSON: { "embedding": [...], "site_id": "..." }
    """
    if matcher is None:
        raise HTTPException(status_code=503, detail="Matcher not initialized")

    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    embedding = data.get("embedding")
    site_id = data.get("site_id")

    if not embedding or not site_id:
        raise HTTPException(status_code=400, detail="embedding and site_id required")

    result = matcher.find_match(embedding, site_id)

    if result is None:
        return JSONResponse(content={"match": None})

    return JSONResponse(
        content={
            "match": {
                "subject_id": result.subject_id,
                "display_name": result.display_name,
                "list_type": result.list_type,
                "distance": result.distance,
                "confidence": result.confidence,
            }
        }
    )
