"""Vani-Setu backend: serves the frontend, the hand-tracking model, and
persists translation history to SQLite."""

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Annotated

from starlette.concurrency import run_in_threadpool
import db
import speech

BASE_DIR = Path(__file__).parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
MODELS_DIR = BASE_DIR / "models"

app = FastAPI(title="Vani-Setu API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_cache(request, call_next):
    """Tell the browser never to cache the app files, so design/code changes
    always show up immediately on reload (no stale styles or scripts)."""
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


class TranslationIn(BaseModel):
    text: str
    mode: str
    timestamp: str


@app.on_event("startup")
def on_startup():
    db.init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}


class HandSample(BaseModel):
    points: Annotated[list[tuple[float, float]], Field(min_length=21, max_length=21)]
    width: int = Field(ge=64, le=4096)
    height: int = Field(ge=64, le=4096)


@app.get("/api/asl/status")
def asl_status():
    try:
        import asl_model
        asl_model.session()
        return {"ready": True, "supported": asl_model.SUPPORTED,
                "kind": "static ASL letters", "threshold": asl_model.THRESHOLD,
                "measured_accuracy": None}
    except Exception:
        return {"ready": False, "detail": "Local ASL model unavailable. Run setup-speech.bat and restart run.bat."}


@app.post("/api/asl/recognize")
def recognize_hand(sample: HandSample):
    try:
        import asl_model
        if any(not (-0.5 <= x <= 1.5 and -0.5 <= y <= 1.5) for x, y in sample.points):
            raise HTTPException(400, "Invalid hand coordinates")
        return asl_model.predict(sample.points, sample.width, sample.height)
    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(400, str(error))
    except Exception:
        raise HTTPException(503, "ASL recognition unavailable. Restart using run.bat.")


@app.post("/api/speech")
async def recognize_speech(request: Request, language: str = "en"):
    if language not in {"en", "hi"}:
        raise HTTPException(400, "Unsupported speech language")
    # Accept only same-origin browser requests to this local service.
    origin = request.headers.get("origin")
    if origin and origin != str(request.base_url).rstrip("/"):
        raise HTTPException(403, "Use the microphone from the app page")
    audio = bytearray()
    async for chunk in request.stream():
        audio.extend(chunk)
        if len(audio) > 6 * 1024 * 1024:
            raise HTTPException(413, "Recording too large. Keep it under 30 seconds.")
    if not audio:
        raise HTTPException(400, "No microphone audio received")
    try:
        text = await run_in_threadpool(speech.transcribe, bytes(audio), language)
    except ImportError:
        raise HTTPException(503, "Local speech is not installed. Run setup-speech.bat, then restart with run.bat.")
    except RuntimeError as error:
        raise HTTPException(503, str(error))
    except Exception:
        raise HTTPException(422, "Could not decode this recording. Please record again.")
    return {"text": text}


@app.post("/api/translations")
def create_translation(payload: TranslationIn):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")
    return db.create_translation(payload.text, payload.mode, payload.timestamp)


@app.get("/api/translations")
def get_translations():
    return db.list_translations()


@app.delete("/api/translations/{translation_id}")
def remove_translation(translation_id: int):
    if not db.delete_translation(translation_id):
        raise HTTPException(status_code=404, detail="translation not found")
    return {"deleted": translation_id}


@app.get("/models/hand_landmarker.task")
def get_model():
    model_path = MODELS_DIR / "hand_landmarker.task"
    if not model_path.exists():
        raise HTTPException(status_code=404, detail="model file not found")
    return FileResponse(model_path, media_type="application/octet-stream")


app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")
app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
